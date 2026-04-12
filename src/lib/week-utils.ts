/**
 * PostgreSQL `date_trunc('week', ts AT TIME ZONE 'utc')` 와 맞추기 위한 UTC 주 시작(월요일) 날짜.
 */
export function getUtcWeekStartDateString(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dow = d.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** UI에 쓰는 결측 날짜 문구 (week_start / created_at 등) */
export const DATE_MISSING_LABEL = "날짜 정보 없음";

/**
 * `YYYY-MM-DD` 형태이며 실제 달력상 유효한지 검사합니다.
 * null·undefined·빈 문자열·Invalid Date는 false.
 */
export function isValidCalendarDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = value.trim();
  if (t === "") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const y = Number(t.slice(0, 4));
  const mo = Number(t.slice(5, 7));
  const day = Number(t.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return false;
  const d = new Date(Date.UTC(y, mo - 1, day));
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === y &&
    d.getUTCMonth() === mo - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * ISO 타임스탬프·날짜 문자열 등을 파싱합니다. 무효하면 null.
 */
export function parseValidDate(isoLike: unknown): Date | null {
  if (isoLike == null) return null;
  if (typeof isoLike !== "string") return null;
  const s = isoLike.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * 주 시작일(YYYY-MM-DD)을 사용자에게 보기 좋게 표시합니다.
 */
export function formatCalendarDateForDisplay(isoDate: unknown): string {
  if (typeof isoDate !== "string") return DATE_MISSING_LABEL;
  const t = isoDate.trim();
  if (!isValidCalendarDateString(t)) {
    return DATE_MISSING_LABEL;
  }
  try {
    const d = new Date(t + "T12:00:00.000Z");
    if (Number.isNaN(d.getTime())) return DATE_MISSING_LABEL;
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return DATE_MISSING_LABEL;
  }
}

/**
 * settlement_history.created_at 등 타임스탬프용.
 */
export function formatTimestampForDisplay(isoLike: unknown): string {
  const d = parseValidDate(isoLike);
  if (!d) return DATE_MISSING_LABEL;
  try {
    return d.toLocaleString("ko-KR", {
      dateStyle: "medium",
    });
  } catch {
    return DATE_MISSING_LABEL;
  }
}

/** 정렬·비교용 ms. 무효한 문자열은 0. */
export function safeDateTimeMs(isoLike: unknown): number {
  const d = parseValidDate(isoLike);
  return d ? d.getTime() : 0;
}

export function getUtcWeekRangeIso(weekStartDateStr: string): {
  startIso: string;
  endIso: string;
} | null {
  const t = weekStartDateStr.trim();
  if (!isValidCalendarDateString(t)) return null;
  const start = new Date(t + "T00:00:00.000Z");
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
