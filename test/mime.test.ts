import { describe, it, expect } from "vitest";
import { validateImageHeader, ALLOWED_IMAGE_MIME } from "../server/images/mime.js";

const TEN_MB = 10 * 1024 * 1024;

describe("validateImageHeader", () => {
  it("accepts image/png under cap", () => {
    expect(
      validateImageHeader({ contentType: "image/png", contentLength: 1024 }),
    ).toEqual({ ok: true, mediaType: "image/png" });
  });
  it("accepts image/jpeg under cap", () => {
    expect(
      validateImageHeader({ contentType: "image/jpeg; charset=binary", contentLength: 500_000 }),
    ).toEqual({ ok: true, mediaType: "image/jpeg" });
  });
  it("accepts image/webp", () => {
    expect(
      validateImageHeader({ contentType: "image/webp", contentLength: 1 }),
    ).toEqual({ ok: true, mediaType: "image/webp" });
  });
  it("accepts image/gif", () => {
    expect(
      validateImageHeader({ contentType: "image/gif", contentLength: 1 }),
    ).toEqual({ ok: true, mediaType: "image/gif" });
  });
  it("rejects application/pdf", () => {
    expect(
      validateImageHeader({ contentType: "application/pdf", contentLength: 1 }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/mime|type/i) });
  });
  it("rejects application/octet-stream", () => {
    expect(
      validateImageHeader({ contentType: "application/octet-stream", contentLength: 1 }),
    ).toMatchObject({ ok: false });
  });
  it("rejects missing content-type", () => {
    expect(
      validateImageHeader({ contentType: undefined, contentLength: 1 }),
    ).toMatchObject({ ok: false });
  });
  it("rejects oversize even with valid mime", () => {
    expect(
      validateImageHeader({ contentType: "image/png", contentLength: TEN_MB + 1 }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/too large|size/i) });
  });
  it("rejects exactly cap+1", () => {
    expect(
      validateImageHeader({ contentType: "image/jpeg", contentLength: TEN_MB + 1 }),
    ).toMatchObject({ ok: false });
  });
  it("accepts exactly the cap", () => {
    expect(
      validateImageHeader({ contentType: "image/jpeg", contentLength: TEN_MB }),
    ).toMatchObject({ ok: true });
  });
  it("exposes the allowed mime set", () => {
    expect(ALLOWED_IMAGE_MIME.has("image/png")).toBe(true);
    expect(ALLOWED_IMAGE_MIME.has("image/heic")).toBe(false);
  });
});
