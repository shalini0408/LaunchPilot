import { afterEach, expect, it, vi } from "vitest";
import { setSessionActive, sessionGeneration, reportExpired } from "./session";
afterEach(() => {
  setSessionActive(false);
  vi.restoreAllMocks();
});
it("reports an expired active session", () => {
  setSessionActive(true);
  const event = vi.spyOn(window, "dispatchEvent");
  reportExpired(sessionGeneration());
  expect(event).toHaveBeenCalledWith(
    expect.objectContaining({ type: "launchpilot-session-expired" }),
  );
});
it("ignores a response after logout", () => {
  setSessionActive(true);
  const start = sessionGeneration();
  setSessionActive(false);
  const event = vi.spyOn(window, "dispatchEvent");
  reportExpired(start);
  expect(event).not.toHaveBeenCalled();
});
it("ignores an old request after a new account signs in", () => {
  setSessionActive(true);
  const old = sessionGeneration();
  setSessionActive(false);
  setSessionActive(true);
  const event = vi.spyOn(window, "dispatchEvent");
  reportExpired(old);
  expect(event).not.toHaveBeenCalled();
  reportExpired(sessionGeneration());
  expect(event).toHaveBeenCalledOnce();
});
