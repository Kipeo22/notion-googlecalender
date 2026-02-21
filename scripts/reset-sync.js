const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const creds = require("/Users/kipeo/Downloads/lucky-wonder-488106-j1-37fa07e648c3.json");

const NOTION_API_KEY = "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";
const DB_ID = "30de24208fdb81a89c8a000b5577feb3";
const OLD_CAL_ID = "6c876ef8d270f585a4a4a43e23c7616b153b10c984edcd4ce90416b4119be50d@group.calendar.google.com";
const NEW_CAL_ID = "3f94c5aac4654ebfc083a319f93d1c5a249a32a542883a5938b551e042f1dd42@group.calendar.google.com";

async function main() {
  const notion = new Client({ auth: NOTION_API_KEY });
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  const calendar = google.calendar({ version: "v3", auth });

  // 1. 古いカレンダーのイベント全削除
  console.log("=== 古いカレンダーのイベント削除 ===");
  try {
    const events = await calendar.events.list({ calendarId: OLD_CAL_ID, maxResults: 100 });
    for (const event of events.data.items || []) {
      await calendar.events.delete({ calendarId: OLD_CAL_ID, eventId: event.id });
      console.log("  削除:", event.summary);
    }
    console.log("完了");
  } catch (e) {
    console.log("エラー:", e.message?.substring(0, 100));
  }

  // 2. GCalEventIDクリア
  console.log("\n=== NotionのGCalEventIDクリア ===");
  const res = await notion.dataSources.query({ data_source_id: DB_ID, page_size: 100 });
  for (const page of res.results) {
    if (page.properties["GCalEventID"]?.rich_text?.length > 0) {
      const title = page.properties["名前"]?.title?.[0]?.plain_text;
      await notion.pages.update({
        page_id: page.id,
        properties: { GCalEventID: { rich_text: [] } },
      });
      console.log("  クリア:", title);
    }
  }

  // 3. TODOタイムに同期
  console.log("\n=== TODOタイムに新規同期 ===");
  const res2 = await notion.dataSources.query({ data_source_id: DB_ID, page_size: 100 });
  for (const page of res2.results) {
    const when = page.properties["いつやる？"]?.date;
    const title = page.properties["名前"]?.title?.[0]?.plain_text || "unknown";
    if (when && when.start) {
      const isAllDay = !when.start.includes("T");
      let endDate = when.end || when.start;
      if (isAllDay && endDate === when.start) {
        const d = new Date(endDate);
        d.setDate(d.getDate() + 1);
        endDate = d.toISOString().split("T")[0];
      }

      try {
        const event = await calendar.events.insert({
          calendarId: NEW_CAL_ID,
          requestBody: {
            summary: title,
            description: "Notion タスク: https://notion.so/" + page.id.replace(/-/g, ""),
            start: isAllDay ? { date: when.start } : { dateTime: when.start, timeZone: "Asia/Tokyo" },
            end: isAllDay ? { date: endDate } : { dateTime: endDate, timeZone: "Asia/Tokyo" },
          },
        });
        await notion.pages.update({
          page_id: page.id,
          properties: { GCalEventID: { rich_text: [{ text: { content: event.data.id } }] } },
        });
        console.log("  作成:", title, "→", event.data.id);
      } catch (e) {
        console.log("  エラー:", title, e.message?.substring(0, 100));
      }
    }
  }
  console.log("\n✅ 完了!");
}

main().catch(console.error);
