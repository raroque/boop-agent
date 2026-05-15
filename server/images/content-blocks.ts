import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import { MAX_IMAGE_BYTES, validateImageHeader } from "./mime.js";

export interface ImageBytes {
  bytes: Buffer;
  mediaType: string;
}

export type FetchBytes = (storageId: string) => Promise<ImageBytes>;

export interface BuildPromptArgs {
  text: string;
  imageStorageIds: string[] | undefined;
  fetchBytes: FetchBytes;
}

type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
type TextBlock = { type: "text"; text: string };

export type PromptInput = string | Array<ImageBlock | TextBlock>;

export async function buildPromptWithImages(
  args: BuildPromptArgs,
): Promise<PromptInput> {
  const ids = args.imageStorageIds ?? [];
  if (ids.length === 0) return args.text;

  const fetched = await Promise.all(ids.map((id) => args.fetchBytes(id)));
  const blocks: Array<ImageBlock | TextBlock> = fetched.map(({ bytes, mediaType }) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data: bytes.toString("base64"),
    },
  }));
  blocks.push({ type: "text", text: args.text.length > 0 ? args.text : "(image)" });
  return blocks;
}

export async function fetchStoredBytes(storageId: string): Promise<ImageBytes> {
  // TODO(codegen): drop the `as never` once the regenerated Convex API
  // reflects the new getStorageUrl query (blocked on schema push).
  const url = await convex.query(api.messages.getStorageUrl, {
    storageId: storageId as never,
  });
  if (!url) throw new Error(`image storage missing: ${storageId}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch failed: HTTP ${res.status}`);
  // Defence-in-depth: a regression in the ingest validator or a future schema
  // change could leave an oversized or wrong-MIME blob behind; refuse rather
  // than balloon memory or poison the Anthropic call.
  const lenHeader = res.headers.get("content-length");
  const check = validateImageHeader({
    contentType: res.headers.get("content-type") ?? undefined,
    contentLength: lenHeader ? Number(lenHeader) : undefined,
  });
  if (!check.ok) throw new Error(`stored image rejected: ${check.reason}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`stored image too large: ${bytes.byteLength} bytes`);
  }
  return { bytes, mediaType: check.mediaType };
}
