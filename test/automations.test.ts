import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convexMock = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));
const spawnExecutionAgentMock = vi.hoisted(() => vi.fn());

vi.mock("../server/convex-client.js", () => ({ convex: convexMock }));
vi.mock("../server/execution-agent.js", () => ({
  spawnExecutionAgent: spawnExecutionAgentMock,
}));
vi.mock("../server/sendblue.js", () => ({ sendImessage: vi.fn() }));
vi.mock("../server/broadcast.js", () => ({ broadcast: vi.fn() }));
vi.mock("../server/timezone-config.js", () => ({
  getUserTimezone: vi.fn(async () => "America/Chicago"),
}));

import { tickAutomations } from "../server/automations.js";

const dueAutomation = {
  automationId: "auto_morning",
  name: "morning message digest",
  task: "Check Slack for important unread messages.",
  integrations: ["slack"],
  schedule: "0 10 * * *",
  timezone: "America/Chicago",
  conversationId: "test:automation",
  notifyConversationId: "test:automation",
  nextRunAt: 1_000,
};

describe("automation scheduler", () => {
  beforeEach(() => {
    convexMock.query.mockResolvedValue([dueAutomation]);
    convexMock.mutation.mockReset();
    spawnExecutionAgentMock.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(2_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips a due automation when another tick already claimed it", async () => {
    convexMock.mutation.mockResolvedValue(false);

    await tickAutomations();

    expect(convexMock.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        automationId: "auto_morning",
        now: 2_000,
        claimedUntil: 1_802_000,
      }),
    );
    expect(spawnExecutionAgentMock).not.toHaveBeenCalled();
  });

  it("claims before launching and advances the schedule when the run fails", async () => {
    convexMock.mutation.mockResolvedValue(true);
    spawnExecutionAgentMock.mockRejectedValueOnce(new Error("slack unavailable"));

    await tickAutomations();

    await vi.waitFor(() => {
      expect(spawnExecutionAgentMock).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(convexMock.mutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          runId: expect.any(String),
          status: "failed",
          error: "Error: slack unavailable",
        }),
      );
    });
    await vi.waitFor(() => {
      expect(convexMock.mutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          automationId: "auto_morning",
          lastRunAt: 2_000,
          nextRunAt: expect.any(Number),
        }),
      );
    });
  });
});
