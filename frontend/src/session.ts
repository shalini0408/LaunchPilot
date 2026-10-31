// Ignore responses from a session that was signed out while a request was in flight.
let generation = 0;
let active = false;
export function setSessionActive(value: boolean) {
  generation++;
  active = value;
}
export const sessionGeneration = () => generation;
export function reportExpired(start: number) {
  if (active && generation === start)
    window.dispatchEvent(new Event("launchpilot-session-expired"));
}
