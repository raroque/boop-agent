import { describe, expect, it } from "vitest";
import { redactToolInputForLog } from "../server/execution-agent.js";
import { isLocalBrowserControlRequest } from "../server/browser-routes.js";
import { parseEnvExtraArgs, parseExtraArgs } from "../server/runtime-config.js";

describe("local browser security hygiene", () => {
  it("redacts browser_fill text before agent log persistence", () => {
    expect(
      redactToolInputForLog("mcp__local_browser__browser_fill", {
        selector: "input[type=password]",
        text: "hunter2",
      }),
    ).toEqual({
      selector: "input[type=password]",
      text: "[redacted]",
    });
  });

  it("leaves non-browser-fill tool inputs intact", () => {
    const input = { selector: "button", text: "Search" };
    expect(redactToolInputForLog("mcp__local_browser__browser_click", input)).toBe(
      input,
    );
  });

  it("allows local browser control requests from localhost", () => {
    expect(isLocalBrowserControlRequest({ host: "localhost:5173" }, "::1")).toBe(true);
    expect(isLocalBrowserControlRequest({ host: "127.0.0.1:3456" }, "127.0.0.1")).toBe(true);
    expect(isLocalBrowserControlRequest({ host: "[::1]:3456" }, "::ffff:127.0.0.1")).toBe(true);
  });

  it("blocks direct remote requests even when the Host header says localhost", () => {
    expect(
      isLocalBrowserControlRequest(
        {
          host: "localhost:3456",
        },
        "192.168.1.50",
      ),
    ).toBe(false);
  });

  it("blocks forwarded public browser control requests", () => {
    expect(
      isLocalBrowserControlRequest({
        host: "public.example.com",
        "x-forwarded-host": "public.example.com",
        "x-forwarded-for": "203.0.113.10",
      }, "127.0.0.1"),
    ).toBe(false);
  });

  it("blocks spoofed forwarded chains that include a public address", () => {
    expect(
      isLocalBrowserControlRequest({
        host: "localhost:3456",
        "x-forwarded-for": "127.0.0.1, 203.0.113.10",
      }, "127.0.0.1"),
    ).toBe(false);
  });

  it("parses saved browser extra args one per line", () => {
    expect(parseExtraArgs("--disable-gpu\n--no-sandbox")).toEqual([
      "--disable-gpu",
      "--no-sandbox",
    ]);
  });

  it("drops high-risk browser extra args", () => {
    expect(
      parseExtraArgs(
        [
          "--disable-gpu",
          "--remote-debugging-port=9222",
          "--disable-web-security",
          "--load-extension=/tmp/example",
          "--proxy-server=http://127.0.0.1:8080",
        ].join("\n"),
      ),
    ).toEqual(["--disable-gpu", "--proxy-server=http://127.0.0.1:8080"]);
  });

  it("parses environment browser extra args with shell-style spacing", () => {
    expect(
      parseEnvExtraArgs("--disable-gpu --no-sandbox\n--disable-dev-shm-usage"),
    ).toEqual(["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"]);
  });
});
