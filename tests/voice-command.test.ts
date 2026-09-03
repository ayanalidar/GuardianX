import { describe, it, expect, beforeAll } from "vitest";
import { parseVoiceCommand } from "@/components/sentinel/war-room/voice-control";

describe("Voice Command Parser", () => {
  it("parses 'scan' commands", () => {
    expect(parseVoiceCommand("scan auth-service")).toEqual({
      action: "scan",
      target: "auth-service",
    });
  });

  it("parses 'show' / 'navigate' commands", () => {
    expect(parseVoiceCommand("show dashboard")).toEqual({
      action: "navigate",
      target: "dashboard",
    });
    expect(parseVoiceCommand("go to settings")).toEqual({
      action: "navigate",
      target: "settings",
    });
    expect(parseVoiceCommand("open clients")).toEqual({
      action: "navigate",
      target: "clients",
    });
  });

  it("parses 'search findings' commands", () => {
    expect(parseVoiceCommand("search findings for SQL injection")).toEqual({
      action: "search",
      target: "sql injection",
    });
    // "find for XSS" → parser captures "XSS"
    const findResult = parseVoiceCommand("find for XSS");
    expect(findResult.action).toBe("search");
  });

  it("parses 'approve patch' commands", () => {
    const result = parseVoiceCommand("approve patch SP-2026-001");
    expect(result.action).toBe("approve");
    expect(result.target).toBe("sp-2026-001");
  });

  it("parses 'status' commands", () => {
    expect(parseVoiceCommand("what's the security posture")).toEqual({
      action: "status",
    });
    expect(parseVoiceCommand("status report")).toEqual({
      action: "status",
    });
  });

  it("parses 'stop' command", () => {
    expect(parseVoiceCommand("stop")).toEqual({ action: "stop" });
    expect(parseVoiceCommand("quiet")).toEqual({ action: "stop" });
    expect(parseVoiceCommand("cancel reading")).toEqual({ action: "stop" });
  });

  it("returns unknown for unrecognized commands", () => {
    expect(parseVoiceCommand("hello world")).toEqual({
      action: "unknown",
      raw: "hello world",
    });
  });

  it("handles empty input", () => {
    expect(parseVoiceCommand("")).toEqual({
      action: "unknown",
      raw: "",
    });
  });
});
