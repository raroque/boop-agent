import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";
import { convex } from "../convex-client.js";

// AES-256-GCM credential vault. The master key lives in BROWSER_CREDENTIAL_KEY
// (32-byte base64) and never leaves this process. Convex stores ciphertext,
// IV, and auth tag only — knowing the Convex URL is not enough to recover
// any password.

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM standard
const AUTH_TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.BROWSER_CREDENTIAL_KEY;
  if (!raw) {
    throw new Error(
      "BROWSER_CREDENTIAL_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.local.",
    );
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `BROWSER_CREDENTIAL_KEY must decode to ${KEY_BYTES} bytes (got ${decoded.length}). Generate a new one with \`openssl rand -base64 32\`.`,
    );
  }
  cachedKey = decoded;
  return cachedKey;
}

export interface EncryptedBlob {
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
  authTag: ArrayBuffer;
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  // Slice to get an ArrayBuffer that matches just this buffer's bytes — the
  // underlying pool may be larger. Convex's v.bytes() validator wants an
  // ArrayBuffer, not a Buffer.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function encrypt(plaintext: string): EncryptedBlob {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encrypt: plaintext must be a non-empty string");
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new Error(`encrypt: unexpected authTag length ${authTag.length}`);
  }
  return {
    ciphertext: bufferToArrayBuffer(ct),
    iv: bufferToArrayBuffer(iv),
    authTag: bufferToArrayBuffer(authTag),
  };
}

export function decrypt(blob: {
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
  authTag: ArrayBuffer;
}): string {
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv));
  decipher.setAuthTag(Buffer.from(blob.authTag));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext)),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}

export interface SaveInput {
  label: string;
  host: string;
  username: string;
  password: string;
  totpSecret?: string;
  notes?: string;
}

export async function saveCredential(input: SaveInput): Promise<void> {
  const pw = encrypt(input.password);
  const totp = input.totpSecret ? encrypt(input.totpSecret) : null;
  await convex.mutation(api.userCredentials.create, {
    label: input.label.trim(),
    host: input.host.trim(),
    username: input.username,
    ciphertext: pw.ciphertext,
    iv: pw.iv,
    authTag: pw.authTag,
    totpCiphertext: totp?.ciphertext,
    totpIv: totp?.iv,
    totpAuthTag: totp?.authTag,
    notes: input.notes?.trim() || undefined,
  });
}

export interface RetrievedCredential {
  id: Id<"userCredentials">;
  label: string;
  host: string;
  username: string;
  password: string;
  totpSecret: string | null;
}

// Called by the (future) browser integration when it needs to actually type
// a credential into a page. Decrypts in-memory and never returns the secret
// to the LLM caller — it's used directly with page.fill().
export async function retrieveCredential(
  label: string,
): Promise<RetrievedCredential | null> {
  const row = await convex.query(api.userCredentials.getSecret, { label });
  if (!row) return null;
  const password = decrypt({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  let totpSecret: string | null = null;
  if (row.totpCiphertext && row.totpIv && row.totpAuthTag) {
    totpSecret = decrypt({
      ciphertext: row.totpCiphertext,
      iv: row.totpIv,
      authTag: row.totpAuthTag,
    });
  }
  await convex.mutation(api.userCredentials.markUsed, { id: row._id });
  return {
    id: row._id,
    label: row.label,
    host: row.host,
    username: row.username,
    password,
    totpSecret,
  };
}

export async function deleteCredential(id: Id<"userCredentials">): Promise<void> {
  await convex.mutation(api.userCredentials.remove, { id });
}

export async function listCredentials() {
  return await convex.query(api.userCredentials.list, {});
}
