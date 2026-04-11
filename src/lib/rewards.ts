/**
 * 가중 보너스(정산 예정): Sync 1건당 5pt + 조회 10회당 1pt(내림)
 */
export function estimatedBonusPoints(syncCount: number, viewCount: number): number {
  const sync = Number.isFinite(syncCount) ? Math.max(0, Math.floor(syncCount)) : 0;
  const views = Number.isFinite(viewCount) ? Math.max(0, Math.floor(viewCount)) : 0;
  return sync * 5 + Math.floor(views / 10);
}
