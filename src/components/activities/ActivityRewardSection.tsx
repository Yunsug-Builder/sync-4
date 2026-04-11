"use client";

import { estimatedBonusPoints } from "@/lib/rewards";

type Props = {
  basePoints: number;
  viewCount: number;
  syncCount: number;
  isSettled: boolean;
  isApproved: boolean;
};

export function ActivityRewardSection({
  basePoints,
  viewCount,
  syncCount,
  isSettled,
  isApproved,
}: Props) {
  if (!isApproved) {
    return null;
  }

  const bonusPreview = estimatedBonusPoints(syncCount, viewCount);

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        리워드 현황
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/50 px-4 py-4">
          <p className="text-xs font-medium text-zinc-500">기본 리워드 (지급 완료)</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">
            +{basePoints.toLocaleString("ko-KR")}
            <span className="ml-1 text-sm font-medium text-zinc-400">pt</span>
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            승인 시 활동 유형 기준으로 즉시 지급된 포인트입니다.
          </p>
        </div>
        <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 px-4 py-4">
          <p className="text-xs font-medium text-fuchsia-200/90">예상 추가 리워드 (정산 예정)</p>
          {isSettled ? (
            <>
              <p className="mt-2 text-lg font-semibold text-zinc-300">정산 완료</p>
              <p className="mt-2 text-xs text-zinc-500">
                이번 주차 가중 보너스는 정산 처리되었습니다.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-bold tabular-nums text-fuchsia-100">
                +{bonusPreview.toLocaleString("ko-KR")}
                <span className="ml-1 text-sm font-medium text-fuchsia-200/70">pt</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                (현재 Sync {syncCount.toLocaleString("ko-KR")} × 5) + (조회{" "}
                {viewCount.toLocaleString("ko-KR")} ÷ 10) = 실시간 추정치 · 매주 월요일
                정산 시 확정됩니다.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
