import { describe, expect, it } from "vitest";
import {
  buildImageLookupTask,
  shouldForceImageLookupSpawn,
} from "../server/interaction-agent.js";

describe("image lookup routing", () => {
  it("forces a spawn for image shopping requests", () => {
    expect(
      shouldForceImageLookupSpawn({
        content: "Where can I buy this product?",
        imageStorageIds: ["kg123"],
      }),
    ).toBe(true);
  });

  it("forces a spawn for image price/search requests", () => {
    expect(
      shouldForceImageLookupSpawn({
        content: "Can you find this and tell me the price?",
        imageStorageIds: ["kg123"],
      }),
    ).toBe(true);
  });

  it("does not force a spawn for direct image description", () => {
    expect(
      shouldForceImageLookupSpawn({
        content: "What's in this image?",
        imageStorageIds: ["kg123"],
      }),
    ).toBe(false);
  });

  it("does not force a spawn without images", () => {
    expect(
      shouldForceImageLookupSpawn({
        content: "Where can I buy this product?",
        imageStorageIds: [],
      }),
    ).toBe(false);
  });

  it("keeps proactive turns out of forced image lookup routing", () => {
    expect(
      shouldForceImageLookupSpawn({
        content: "Where can I buy this product?",
        imageStorageIds: ["kg123"],
        kind: "proactive",
      }),
    ).toBe(false);
  });

  it("builds a sub-agent task that preserves the user request", () => {
    expect(buildImageLookupTask("Where can I buy this product?")).toContain(
      "Where can I buy this product?",
    );
    expect(buildImageLookupTask("Where can I buy this product?")).toContain(
      "attached image",
    );
  });
});
