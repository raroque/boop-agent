import { describe, expect, it } from "vitest";
import { resolveDirectRuntimeSwitch } from "../server/interaction-agent.js";

describe("direct runtime switching", () => {
  it("detects explicit Codex switch requests", () => {
    expect(resolveDirectRuntimeSwitch("Switch to codex")).toBe("codex");
    expect(resolveDirectRuntimeSwitch("can you switch to ChatGPT?")).toBe("codex");
    expect(resolveDirectRuntimeSwitch("please use chatgpt codex for the next turn")).toBe(
      "codex",
    );
  });

  it("detects explicit Claude switch requests", () => {
    expect(resolveDirectRuntimeSwitch("Switch back to Claude")).toBe("claude");
    expect(resolveDirectRuntimeSwitch("set provider to anthropic please")).toBe(
      "claude",
    );
    expect(resolveDirectRuntimeSwitch("use claude agent sdk")).toBe("claude");
  });

  it("ignores non-switch mentions", () => {
    expect(resolveDirectRuntimeSwitch("what model are you using")).toBeNull();
    expect(resolveDirectRuntimeSwitch("what is Codex?")).toBeNull();
    expect(resolveDirectRuntimeSwitch("can Codex see this image?")).toBeNull();
  });
});
