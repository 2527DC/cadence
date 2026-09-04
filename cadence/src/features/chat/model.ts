// The pure part of the chat log. P08.
//
// Days, cursors, previews and the courtesy validation for a send. Nothing here
// imports React, React Native or the Supabase client, so it runs under Jest with no
// environment — see model.test.ts. The rule this mirrors lives in migration 0008
// (`body_matches_kind`); if the two ever disagree the database wins.

import { differenceInCalendarDays, format, parseISO } from 'date-fns';

import { APP_TIMEZONE } from '@/lib/week';

// ---------------------------------------------------------------------------
// Time, in the one timezone the app has
// ---------------------------------------------------------------------------

/** A `YYYY-MM-DD` calendar day in Asia/Kolkata. Two messages share one when they share a day separator. */
export type DayKey = string;

// One formatter, built once: Intl.DateTimeFormat construction is the expensive part
// and a list of a thousand messages asks for this a thousand times.
const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * The wall-clock day and time of an instant, in Asia/Kolkata.
 *
 * OQ-1: a day ends at midnight IST wherever the phone is. A thought written at 00:30
 * on a phone still set to London belongs to the IST day, and the "Today" separator
 * has to agree with todayInAppTimezone() in src/lib/week.ts — both go through Intl
 * with the same zone, so they do. formatToParts rather than format() because some
 * engines print midnight as "24:00" under hour12:false; the parts are normalised.
 */
export function wallClock(iso: string): { day: DayKey; clock: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: '', clock: '' };

  const parts = PARTS.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');

  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    clock: `${hour}:${get('minute')}`,
  };
}

export function dayKeyOf(iso: string): DayKey {
  return wallClock(iso).day;
}

export function clockOf(iso: string): string {
  return wallClock(iso).clock;
}

/**
 * "Today", "Yesterday", the weekday for the rest of the last week, then the date.
 * `today` is passed in rather than read from the clock so the function is pure and
 * a list does not change its labels between two rows rendered across midnight.
 */
export function dayLabel(key: DayKey, today: DayKey): string {
  if (!key) return '';
  const day = parseISO(key);
  const now = parseISO(today);
  const diff = differenceInCalendarDays(now, day);

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return format(day, 'EEEE');
  return day.getFullYear() === now.getFullYear()
    ? format(day, 'EEE d MMM')
    : format(day, 'd MMM yyyy');
}

/**
 * Whether row `index` of an inverted list is the oldest message of its day, and so
 * carries the day separator above it.
 *
 * In an inverted FlatList index 0 is the newest message, at the bottom of the
 * screen, and index + 1 is the message just above it on screen — one step older.
 * A separator belongs at the top of each day's run, which is the row whose older
 * neighbour is on a different day, or which has no older neighbour at all.
 */
export function startsDay(dayKeys: readonly DayKey[], index: number): boolean {
  const current = dayKeys[index];
  if (current === undefined) return false;
  const older = dayKeys[index + 1];
  return older === undefined || older !== current;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** How many messages one page carries. The (thread_id, created_at desc) index makes each page one range scan. */
export const PAGE_SIZE = 50;

/**
 * The keyset cursor for the page after this one: the oldest created_at it holds.
 * A short page is the last page. Keyset rather than offset so that a message
 * arriving while you scroll cannot shift every later page by one and repeat a row.
 */
export function nextPageCursor(
  page: readonly { created_at: string }[],
  pageSize: number = PAGE_SIZE,
): string | undefined {
  if (page.length < pageSize) return undefined;
  return page[page.length - 1]?.created_at;
}

/** All pages in one array, newest first, with any duplicate ids dropped. */
export function flattenPages<T extends { id: string }>(
  pages: readonly (readonly T[])[] | undefined,
): T[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const item of page) {
      // An optimistic row prepended to page one and the same row fetched back on a
      // refetch can overlap for a render; FlatList would warn about the key.
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type MessageKind = 'text' | 'voice';

/** No column limit exists; this is the composer's courtesy cap on a single message. */
export const MAX_BODY_LENGTH = 4000;

export type SendShape = {
  text?: string | null;
  voiceNoteId?: string | null;
};

/** What `body_matches_kind` will accept: a voice note makes it a voice message, otherwise it is text. */
export function kindFor(input: SendShape): MessageKind {
  return input.voiceNoteId ? 'voice' : 'text';
}

/**
 * The reason the database would refuse this send, or null. Mirrors 0008's
 * `body_matches_kind`: text needs a non-blank body and no voice note; voice needs
 * the voice note and carries no body at all. A courtesy, not the gate.
 */
export function sendProblem(input: SendShape): string | null {
  if (input.voiceNoteId) return null;
  if (!input.text || input.text.trim().length === 0) return 'Nothing to send yet.';
  if (input.text.length > MAX_BODY_LENGTH) {
    return `That is ${input.text.length - MAX_BODY_LENGTH} characters over the limit.`;
  }
  return null;
}

/** The body as it is stored: trimmed for text, absent for voice. */
export function bodyFor(input: SendShape): string | null {
  return kindFor(input) === 'voice' ? null : (input.text ?? '').trim();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Below this nothing is sent: a single letter matches most of the log. */
export const MIN_SEARCH_LENGTH = 2;

/** Collapsed whitespace, trimmed. What the query key and the websearch parser both get. */
export function normalizeSearch(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function isSearchable(raw: string): boolean {
  return normalizeSearch(raw).length >= MIN_SEARCH_LENGTH;
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

/** First line, cut to `max`, for a search result or a thread preview. A voice message names itself. */
export function previewOf(message: { kind: MessageKind; body: string | null }, max = 120): string {
  if (message.kind === 'voice') return 'Voice note';
  const firstLine = (message.body ?? '').trim().split('\n')[0] ?? '';
  return firstLine.length > max ? `${firstLine.slice(0, max - 1).trimEnd()}…` : firstLine;
}

// ---------------------------------------------------------------------------
// Which thread was open last
// ---------------------------------------------------------------------------

/**
 * The thread the tab shows. The daily log needs nothing; a goal thread carries the
 * goal's title so the thread row can be created with it on first open.
 */
export type ThreadSelection =
  { kind: 'daily_log' } | { kind: 'goal'; goalId: string; goalTitle: string };

export const DAILY_LOG: ThreadSelection = { kind: 'daily_log' };

export function sameSelection(a: ThreadSelection | null, b: ThreadSelection | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === 'daily_log' || (b.kind === 'goal' && a.goalId === b.goalId);
}

/**
 * Read a remembered selection back from storage. Anything malformed — an old
 * shape, a hand-edited value, nothing at all — is the daily log, never a crash.
 */
export function parseSelection(raw: string | null | undefined): ThreadSelection {
  if (!raw) return DAILY_LOG;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DAILY_LOG;
    const p = parsed as { kind?: unknown; goalId?: unknown; goalTitle?: unknown };
    if (p.kind === 'goal' && typeof p.goalId === 'string' && p.goalId.length > 0) {
      return {
        kind: 'goal',
        goalId: p.goalId,
        goalTitle: typeof p.goalTitle === 'string' ? p.goalTitle : '',
      };
    }
    return DAILY_LOG;
  } catch {
    return DAILY_LOG;
  }
}

export function serializeSelection(selection: ThreadSelection): string {
  return JSON.stringify(selection);
}
