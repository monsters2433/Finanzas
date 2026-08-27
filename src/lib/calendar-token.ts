import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "./db";
import { safeEqual } from "./auth";

/**
 * The phone's calendar app cannot log in, so the feed carries its own
 * unguessable token in the URL. Rotating it invalidates old subscriptions.
 */
export function getCalendarToken(): string {
  const existing = getSetting("calendar_token");
  if (existing) return existing;
  const token = randomBytes(24).toString("base64url");
  setSetting("calendar_token", token);
  return token;
}

export function rotateCalendarToken(): string {
  const token = randomBytes(24).toString("base64url");
  setSetting("calendar_token", token);
  return token;
}

export function isValidCalendarToken(candidate: string): boolean {
  return safeEqual(candidate, getCalendarToken());
}
