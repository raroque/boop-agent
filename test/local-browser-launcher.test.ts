import { rmSync, statSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const settings = {
    enabled: true,
    profileDir: "/tmp/boop-browser-test-profile",
    showUi: true,
    loginHandoffEnabled: false,
    startUrl: "",
    channel: "chrome",
    executablePath: "",
    extraArgs: [],
  };

  let currentUrl = "about:blank";
  let resolveLaunch: () => void = () => undefined;
  const launchGate = new Promise<void>((resolve) => {
    resolveLaunch = resolve;
  });
  const page = {
    isClosed: vi.fn(() => false),
    goto: vi.fn(async (url: string) => {
      currentUrl = url;
    }),
    url: vi.fn(() => currentUrl),
  };
  const context = {
    close: vi.fn(async () => undefined),
    newPage: vi.fn(async () => page),
    on: vi.fn(),
    pages: vi.fn(() => [page]),
  };
  const launchPersistentContext = vi.fn(async () => {
    await launchGate;
    return context;
  });

  return {
    context,
    launchPersistentContext,
    page,
    resolveLaunch,
    settings,
  };
});

vi.mock("../server/runtime-config.js", () => ({
  getBrowserSettings: vi.fn(async () => mocks.settings),
}));

vi.mock("patchright", () => ({
  chromium: {
    launchPersistentContext: mocks.launchPersistentContext,
  },
}));

import { closeLocalBrowser, launchLocalBrowser } from "../server/browser/launcher.js";

describe("local browser launcher lifecycle", () => {
  afterAll(async () => {
    await closeLocalBrowser();
    rmSync(mocks.settings.profileDir, { recursive: true, force: true });
  });

  it("honors close requests that arrive while Chrome is still launching", async () => {
    rmSync(mocks.settings.profileDir, { recursive: true, force: true });

    const launch = launchLocalBrowser({ url: "https://example.com" });

    await vi.waitFor(() => {
      expect(mocks.launchPersistentContext).toHaveBeenCalledTimes(1);
    });

    const close = closeLocalBrowser();
    expect(mocks.context.close).not.toHaveBeenCalled();

    mocks.resolveLaunch();

    await expect(launch).resolves.toMatchObject({
      ok: true,
      running: true,
      url: "https://example.com/",
    });
    expect(statSync(mocks.settings.profileDir).mode & 0o777).toBe(0o700);
    await close;

    expect(mocks.context.close).toHaveBeenCalledTimes(1);
  });
});
