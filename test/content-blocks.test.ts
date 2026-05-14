import { describe, it, expect } from "vitest";
import { buildPromptWithImages } from "../server/images/content-blocks.js";

const fakeFetch = (mapping: Record<string, { bytes: Buffer; mediaType: string }>) =>
  async (id: string) => {
    const hit = mapping[id];
    if (!hit) throw new Error(`no fake for ${id}`);
    return hit;
  };

describe("buildPromptWithImages", () => {
  it("returns the plain text string when no images", async () => {
    const res = await buildPromptWithImages({
      text: "hello",
      imageStorageIds: undefined,
      fetchBytes: fakeFetch({}),
    });
    expect(res).toBe("hello");
  });
  it("returns the text when imageStorageIds is empty", async () => {
    const res = await buildPromptWithImages({
      text: "hi",
      imageStorageIds: [],
      fetchBytes: fakeFetch({}),
    });
    expect(res).toBe("hi");
  });
  it("returns a content array with image blocks first then text", async () => {
    const res = await buildPromptWithImages({
      text: "what is this",
      imageStorageIds: ["id1"],
      fetchBytes: fakeFetch({
        id1: { bytes: Buffer.from([1, 2, 3]), mediaType: "image/png" },
      }),
    });
    expect(Array.isArray(res)).toBe(true);
    const arr = res as Array<Record<string, unknown>>;
    expect(arr).toHaveLength(2);
    expect(arr[0]).toMatchObject({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: Buffer.from([1, 2, 3]).toString("base64"),
      },
    });
    expect(arr[1]).toEqual({ type: "text", text: "what is this" });
  });
  it("preserves image order when multiple ids", async () => {
    const res = (await buildPromptWithImages({
      text: "x",
      imageStorageIds: ["a", "b"],
      fetchBytes: fakeFetch({
        a: { bytes: Buffer.from([1]), mediaType: "image/jpeg" },
        b: { bytes: Buffer.from([2]), mediaType: "image/png" },
      }),
    })) as Array<Record<string, unknown>>;
    expect((res[0] as { source: { media_type: string } }).source.media_type).toBe("image/jpeg");
    expect((res[1] as { source: { media_type: string } }).source.media_type).toBe("image/png");
    expect(res[2]).toEqual({ type: "text", text: "x" });
  });
  it("uses empty text block when text is missing but images are present", async () => {
    const res = (await buildPromptWithImages({
      text: "",
      imageStorageIds: ["id1"],
      fetchBytes: fakeFetch({
        id1: { bytes: Buffer.from([1]), mediaType: "image/png" },
      }),
    })) as Array<Record<string, unknown>>;
    expect(res).toHaveLength(2);
    expect(res[1]).toEqual({ type: "text", text: "(image)" });
  });
  it("rethrows when fetchBytes rejects", async () => {
    await expect(
      buildPromptWithImages({
        text: "x",
        imageStorageIds: ["missing"],
        fetchBytes: async () => {
          throw new Error("not found");
        },
      }),
    ).rejects.toThrow(/not found/);
  });
});
