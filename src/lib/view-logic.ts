/**
 * 상세 페이지 조회수 RPC 보조 로직
 * - 30분 클라이언트 쿨다운 (view_count 중복 호출 완화)
 * - 키: `${logId}:${viewerKey}` (anon 또는 user id)
 */

export const VIEW_BUMP_STORAGE_PREFIX = "activity_view_bump_v4:";
export const VIEW_BUMP_COOLDOWN_MS = 30 * 60 * 1000;

function storageKey(logId: string, viewerKey: string): string {
  return `${VIEW_BUMP_STORAGE_PREFIX}${logId}:${viewerKey}`;
}

export function shouldSkipActivityViewBump(logId: string, viewerKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(storageKey(logId, viewerKey));
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < VIEW_BUMP_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function markActivityViewBumped(logId: string, viewerKey: string): void {
  try {
    localStorage.setItem(storageKey(logId, viewerKey), String(Date.now()));
  } catch {
    /* ignore quota/private mode */
  }
}

export function clearActivityViewBump(logId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (logId) {
      const prefix = `${VIEW_BUMP_STORAGE_PREFIX}${logId}:`;
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefix)) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(VIEW_BUMP_STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
