import { google, calendar_v3 } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getCalendarClient(): calendar_v3.Calendar {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: SCOPES,
  });

  return google.calendar({ version: "v3", auth });
}

const calendarId = process.env.GOOGLE_CALENDAR_ID!;

export interface CalendarEvent {
  summary: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  description?: string;
}

/**
 * Googleカレンダーにイベントを作成
 * @returns 作成されたイベントのID
 */
export async function createEvent(event: CalendarEvent): Promise<string> {
  const calendar = getCalendarClient();

  const isAllDay = !event.start.includes("T");

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: isAllDay
        ? { date: event.start }
        : { dateTime: event.start, timeZone: "Asia/Tokyo" },
      end: isAllDay
        ? { date: event.end || event.start }
        : {
            dateTime: event.end || event.start,
            timeZone: "Asia/Tokyo",
          },
    },
  });

  return response.data.id!;
}

/**
 * Googleカレンダーのイベントを更新
 */
export async function updateEvent(
  eventId: string,
  event: CalendarEvent
): Promise<void> {
  const calendar = getCalendarClient();

  const isAllDay = !event.start.includes("T");

  await calendar.events.update({
    calendarId,
    eventId,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: isAllDay
        ? { date: event.start }
        : { dateTime: event.start, timeZone: "Asia/Tokyo" },
      end: isAllDay
        ? { date: event.end || event.start }
        : {
            dateTime: event.end || event.start,
            timeZone: "Asia/Tokyo",
          },
    },
  });
}

/**
 * Googleカレンダーのイベントを削除
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const calendar = getCalendarClient();

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    });
  } catch (error: unknown) {
    // 既に削除されている場合は無視
    if (error instanceof Error && "code" in error && (error as { code: number }).code === 404) {
      console.log(`Event ${eventId} already deleted, skipping.`);
    } else {
      throw error;
    }
  }
}

/**
 * Googleカレンダーのイベントを取得
 */
export async function getEvent(
  eventId: string
): Promise<calendar_v3.Schema$Event | null> {
  const calendar = getCalendarClient();

  try {
    const response = await calendar.events.get({
      calendarId,
      eventId,
    });
    return response.data;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code: number }).code === 404) {
      return null;
    }
    throw error;
  }
}
