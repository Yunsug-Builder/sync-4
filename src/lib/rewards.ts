/**
 * Reward bonus preview: Sync 1 = 5V + verified qualified views / 10.
 */
export function estimatedBonusVibes(syncCount: number, qualifiedViewCount: number): number {
  const sync = Number.isFinite(syncCount) ? Math.max(0, Math.floor(syncCount)) : 0;
  const views = Number.isFinite(qualifiedViewCount) ? Math.max(0, Math.floor(qualifiedViewCount)) : 0;
  return sync * 5 + Math.floor(views / 10);
}
