import {
  getNotionTasks,
  setGCalEventId,
  clearGCalEventId,
  getTasksWithGCalId,
  type NotionTask,
} from "./notion";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  type CalendarEvent,
} from "./google-calendar";

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
  details: string[];
}

/**
 * Notion → Google Calendar の同期を実行
 *
 * 同期ロジック:
 * 1. Notionから全タスク（または最近更新されたタスク）を取得
 * 2. 各タスクについて:
 *    - 「いつやる？」がある & GCalEventIDなし → 新規イベント作成
 *    - 「いつやる？」がある & GCalEventIDあり → イベント更新
 *    - 「いつやる？」がない & GCalEventIDあり → イベント削除
 */
export async function syncNotionToGCal(
  sinceTimestamp?: string
): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
    details: [],
  };

  try {
    // Notionからタスクを取得
    const tasks = await getNotionTasks(sinceTimestamp);
    result.details.push(`Notionから ${tasks.length} 件のタスクを取得`);

    for (const task of tasks) {
      try {
        await processTask(task, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`タスク「${task.title}」の処理エラー: ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`同期全体のエラー: ${message}`);
  }

  return result;
}

async function processTask(
  task: NotionTask,
  result: SyncResult
): Promise<void> {
  const hasWhenDate = task.whenStart !== null;
  const hasGCalId = task.gcalEventId !== null && task.gcalEventId !== "";

  if (hasWhenDate && !hasGCalId) {
    // 新規作成: 「いつやる？」があるが、まだGCalに登録されていない
    const event = taskToCalendarEvent(task);
    const eventId = await createEvent(event);
    await setGCalEventId(task.id, eventId);
    result.created++;
    result.details.push(`作成: 「${task.title}」→ GCal イベント ${eventId}`);
  } else if (hasWhenDate && hasGCalId) {
    // 更新: 「いつやる？」とGCalEventIDの両方がある
    const event = taskToCalendarEvent(task);

    // 既存イベントが存在するか確認
    const existingEvent = await getEvent(task.gcalEventId!);
    if (existingEvent) {
      // イベント内容を比較して変更があれば更新
      if (needsUpdate(existingEvent, event)) {
        await updateEvent(task.gcalEventId!, event);
        result.updated++;
        result.details.push(`更新: 「${task.title}」`);
      } else {
        result.details.push(`スキップ（変更なし）: 「${task.title}」`);
      }
    } else {
      // GCalイベントが削除されている → 再作成
      const newEventId = await createEvent(event);
      await setGCalEventId(task.id, newEventId);
      result.created++;
      result.details.push(`再作成: 「${task.title}」→ GCal イベント ${newEventId}`);
    }
  } else if (!hasWhenDate && hasGCalId) {
    // 削除: 「いつやる？」が空でGCalEventIDがある
    await deleteEvent(task.gcalEventId!);
    await clearGCalEventId(task.id);
    result.deleted++;
    result.details.push(`削除: 「${task.title}」`);
  }
  // 「いつやる？」もGCalEventIDもなければ何もしない
}

function taskToCalendarEvent(task: NotionTask): CalendarEvent {
  // 「いつやる？」の日時がある場合
  let start = task.whenStart!;
  let end = task.whenEnd || task.whenStart!;

  // 終日イベント（時刻なし）の場合、endを翌日にする必要がある
  if (!start.includes("T") && end === start) {
    // 終日イベントのendは翌日の日付
    const endDate = new Date(end);
    endDate.setDate(endDate.getDate() + 1);
    end = endDate.toISOString().split("T")[0];
  }

  return {
    summary: task.title,
    start,
    end,
    description: `Notion タスク: https://notion.so/${task.id.replace(/-/g, "")}`,
  };
}

function needsUpdate(
  existing: { summary?: string | null; start?: { dateTime?: string | null; date?: string | null } | null; end?: { dateTime?: string | null; date?: string | null } | null },
  updated: CalendarEvent
): boolean {
  // タイトルの比較
  if (existing.summary !== updated.summary) return true;

  // 開始日時の比較
  const existingStart =
    existing.start?.dateTime || existing.start?.date || "";
  const updatedStart = updated.start;
  if (normalizeDateTime(existingStart) !== normalizeDateTime(updatedStart))
    return true;

  // 終了日時の比較
  const existingEnd = existing.end?.dateTime || existing.end?.date || "";
  const updatedEnd = updated.end;
  if (normalizeDateTime(existingEnd) !== normalizeDateTime(updatedEnd))
    return true;

  return false;
}

/**
 * 日時文字列を正規化して比較可能にする
 */
function normalizeDateTime(dt: string): string {
  if (!dt) return "";
  // 日付のみの場合はそのまま
  if (!dt.includes("T")) return dt;
  // ISO 8601形式の場合、Dateオブジェクトに変換してUNIXタイムスタンプで比較
  try {
    return new Date(dt).getTime().toString();
  } catch {
    return dt;
  }
}
