import { body, ok, str } from "@/lib/http";
import { getCalendarToken, rotateCalendarToken } from "@/lib/calendar-token";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  const token = getCalendarToken();
  return ok({ url: `${origin}/api/calendar/${token}.ics`, token });
}

export async function POST(request: Request) {
  const { action } = await body<{ action?: string }>(request);
  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  const token = str(action) === "rotate" ? rotateCalendarToken() : getCalendarToken();
  return ok({ url: `${origin}/api/calendar/${token}.ics`, token });
}
