import { createHmac } from "node:crypto";

// RFC 6238 TOTP, configured for the defaults every consumer 2FA app (Google
// Authenticator, 1Password, Authy, etc.) uses: 30s step, 6 digits, SHA-1,
// base32-encoded secret. No npm dep — about 30 lines of code that's been
// stable since 2011.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) {
      throw new Error(`Invalid base32 character: ${ch}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

export interface TotpOptions {
  digits?: number;        // default 6
  stepSeconds?: number;   // default 30
  algorithm?: "sha1" | "sha256" | "sha512"; // default sha1
  timestampMs?: number;   // default Date.now() — for testing
}

export function generateTotp(secretBase32: string, opts: TotpOptions = {}): string {
  const digits = opts.digits ?? 6;
  const step = opts.stepSeconds ?? 30;
  const algo = opts.algorithm ?? "sha1";
  const now = opts.timestampMs ?? Date.now();

  const key = base32Decode(secretBase32);
  const counter = Math.floor(now / 1000 / step);

  // Counter as 8-byte big-endian.
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac(algo, key).update(counterBuf).digest();
  // Dynamic truncation per RFC 4226 §5.3.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % 10 ** digits).toString().padStart(digits, "0");
}
