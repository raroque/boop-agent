export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_IMAGE_MIME_LIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type ImageMediaType = (typeof ALLOWED_IMAGE_MIME_LIST)[number];

export const ALLOWED_IMAGE_MIME: ReadonlySet<string> = new Set(ALLOWED_IMAGE_MIME_LIST);

export type ImageHeaderCheck =
  | { ok: true; mediaType: ImageMediaType }
  | { ok: false; reason: string };

export interface ImageHeader {
  contentType: string | undefined;
  contentLength: number | undefined;
}

function normalizeContentType(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const semi = raw.indexOf(";");
  const trimmed = (semi >= 0 ? raw.slice(0, semi) : raw).trim().toLowerCase();
  return trimmed || undefined;
}

export function validateImageHeader(header: ImageHeader): ImageHeaderCheck {
  const mime = normalizeContentType(header.contentType);
  if (!mime) return { ok: false, reason: "missing content-type" };
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return { ok: false, reason: `disallowed mime type: ${mime}` };
  }
  if (typeof header.contentLength === "number" && header.contentLength > MAX_IMAGE_BYTES) {
    return { ok: false, reason: `image too large: ${header.contentLength} bytes` };
  }
  return { ok: true, mediaType: mime as ImageMediaType };
}
