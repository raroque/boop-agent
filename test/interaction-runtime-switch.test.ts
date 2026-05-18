import { describe, expect, it } from "vitest";
import {
  resolveDirectRuntimeSwitch,
  resolveSpawnIntegrations,
} from "../server/interaction-agent.js";

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

describe("local browser integration routing", () => {
  const available = ["gmail", "browser"];

  it("forces browser for explicit local-browser requests", () => {
    expect(
      resolveSpawnIntegrations(
        ["gmail"],
        available,
        "Could you use a local browser and find the top Reddit comment?",
      ),
    ).toEqual(["browser"]);
    expect(
      resolveSpawnIntegrations(
        ["gmail"],
        available,
        "Use Chrome on my machine, not Composio.",
      ),
    ).toEqual(["browser"]);
  });

  it("does not force browser for incidental browser or Chrome phrases", () => {
    expect(
      resolveSpawnIntegrations(
        ["gmail"],
        available,
        "Use a browser extension summary from the email if there is one.",
      ),
    ).toEqual(["gmail"]);
    expect(
      resolveSpawnIntegrations(
        ["gmail"],
        available,
        "Save this page in Chrome's reading list after you email it.",
      ),
    ).toEqual(["gmail"]);
  });
});
