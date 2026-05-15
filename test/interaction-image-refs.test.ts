import { describe, expect, it } from "vitest";
import { resolveSpawnImageRefs } from "../server/interaction-agent.js";

describe("spawn image ref propagation", () => {
  it("defaults omitted refs to all current-turn images", () => {
    expect(resolveSpawnImageRefs(undefined, ["img1", "img2"])).toEqual([
      "img1",
      "img2",
    ]);
  });

  it("defaults empty refs to all current-turn images", () => {
    expect(resolveSpawnImageRefs([], ["img1"])).toEqual(["img1"]);
  });

  it("filters requested refs to current-turn images only", () => {
    expect(resolveSpawnImageRefs(["img2", "other"], ["img1", "img2"])).toEqual([
      "img2",
    ]);
  });

  it("falls back to all images when requested refs are invalid", () => {
    expect(resolveSpawnImageRefs(["other"], ["img1", "img2"])).toEqual([
      "img1",
      "img2",
    ]);
  });

  it("returns undefined when there are no current-turn images", () => {
    expect(resolveSpawnImageRefs(undefined, [])).toBeUndefined();
  });
});
