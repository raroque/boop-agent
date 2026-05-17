import { describe, expect, it } from "vitest";
import { formatUserMemoryContextBlock } from "../server/memory/context.js";

describe("user memory context formatting", () => {
  it("adds authoritative identity guidance for proactive and worker prompts", () => {
    const block = formatUserMemoryContextBlock([
      { content: "User is the account owner." },
      { content: "The prior belief that the user was someone else was incorrect." },
      { content: "The assistant in this workspace identifies as Boop." },
      { content: "User is the account owner." },
    ]);

    expect(block).toContain("Known user identity/correction memories:");
    expect(block).toContain("- User is the account owner.");
    expect(block).toContain(
      "- The prior belief that the user was someone else was incorrect.",
    );
    expect(block).not.toContain("identifies as Boop");
    expect(block.match(/User is the account owner/g)).toHaveLength(1);
    expect(block).toContain("do not describe that person as a third party");
  });

  it("omits the block when no identity context is available", () => {
    expect(formatUserMemoryContextBlock([{ content: " " }])).toBe("");
  });
});
