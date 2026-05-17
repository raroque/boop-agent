import { describe, expect, it } from "vitest";
import { isUsageLimitError, usageLimitReply } from "../server/runtime-errors.js";

describe("runtime usage-limit errors", () => {
  it("detects Codex credit limit errors", () => {
    const err = new Error(
      "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at May 17th, 2026 2:19 AM.",
    );

    expect(isUsageLimitError(err)).toBe(true);
  });

  it("formats a user-actionable reply with reset time and credits URL", () => {
    const err = new Error(
      "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at May 17th, 2026 2:19 AM.",
    );

    expect(usageLimitReply(err, "Codex")).toBe(
      "Codex hit its usage limit, so I can't process that right now. It says to try again at May 17th, 2026 2:19 AM. Add credits here: https://chatgpt.com/codex/settings/usage, or switch me to Claude.",
    );
  });

  it("leaves unrelated runtime errors alone", () => {
    expect(usageLimitReply(new Error("network timeout"), "Codex")).toBeNull();
  });
});
