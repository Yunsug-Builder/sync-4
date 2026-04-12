"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchUserActivityStatsMap,
  type UserActivityStats,
} from "@/lib/leaderboard-stats";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  fetchWeeklyRisingLeaderboard,
  fetchWeeklyRisingUserPlace,
  formatWeeklyActivitySubtitle,
  WEEKLY_RANKING_FALLBACK_MESSAGE,
  type WeeklyLeaderboardRow,
  type WeeklyUserPlace,
} from "@/lib/weekly-rising";
import { formatCalendarDateForDisplay, getUtcWeekStartDateString } from "@/lib/week-utils";

type ProfileRow = {
  id: string;
  nickname: string | null;
  total_points: number;
  avatar_url: string | null;
};

type LeaderboardRow = ProfileRow & UserActivityStats;

const LIMIT = 50;

type TabId = "cumulative" | "weekly";

function displayName(n: string | null | undefined) {
  const t = n?.trim();
  return t && t.length > 0 ? t : "익명";
}

function formatStatLine(s: UserActivityStats) {
  return `게시글 ${s.postCount.toLocaleString("ko-KR")} · Sync ${s.syncCount.toLocaleString("ko-KR")} · 조회 ${s.viewSum.toLocaleString("ko-KR")}`;
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<TabId>("cumulative");

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weeklyRows, setWeeklyRows] = useState<WeeklyLeaderboardRow[]>([]);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weeklyMyPlace, setWeeklyMyPlace] = useState<WeeklyUserPlace | null>(null);
  const [weeklyPlaceErr, setWeeklyPlaceErr] = useState<string | null>(null);

  const [meId, setMeId] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myPoints, setMyPoints] = useState<number | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [myStats, setMyStats] = useState<UserActivityStats | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      setWeeklyError(null);
      setWeeklyPlaceErr(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;

        const uid = user?.id ?? null;
        setMeId(uid);

        const listRes = await supabase
          .from("profiles")
          .select("id, nickname, total_points, avatar_url")
          .order("total_points", { ascending: false })
          .limit(LIMIT);

        if (cancelled) return;

        if (listRes.error) {
          setError(listRes.error.message);
          setRows([]);
          return;
        }

        const base = (listRes.data ?? []) as ProfileRow[];
        const topIds = base.map((p) => p.id);
        const idsForStats =
          uid && !topIds.includes(uid) ? [...topIds, uid] : topIds;

        const [statsMap, weekBoard, weekPlace] = await Promise.all([
          fetchUserActivityStatsMap(supabase, idsForStats),
          fetchWeeklyRisingLeaderboard(supabase, LIMIT),
          uid
            ? fetchWeeklyRisingUserPlace(supabase, uid)
            : Promise.resolve({
                place: null as WeeklyUserPlace | null,
                error: null as string | null,
              }),
        ]);

        if (cancelled) return;

        setWeeklyError(weekBoard.error);
        setWeeklyRows(weekBoard.rows);
        setWeeklyPlaceErr(weekPlace.error);
        setWeeklyMyPlace(weekPlace.place);

        const merged: LeaderboardRow[] = base.map((p) => {
          const s = statsMap.get(p.id) ?? {
            postCount: 0,
            syncCount: 0,
            viewSum: 0,
          };
          return { ...p, ...s };
        });

        setRows(merged);

        if (uid) {
          const { data: me, error: meErr } = await supabase
            .from("profiles")
            .select("total_points, nickname")
            .eq("id", uid)
            .maybeSingle();

          if (!cancelled && !meErr && me) {
            const tp =
              typeof (me as { total_points?: number }).total_points === "number"
                ? (me as { total_points: number }).total_points
                : 0;
            setMyPoints(tp);
            setMyName((me as { nickname?: string | null }).nickname ?? null);

            const mySt = statsMap.get(uid) ?? {
              postCount: 0,
              syncCount: 0,
              viewSum: 0,
            };
            setMyStats(mySt);

            const { count, error: cErr } = await supabase
              .from("profiles")
              .select("*", { count: "exact", head: true })
              .gt("total_points", tp);

            if (!cancelled && !cErr) {
              setMyRank((count ?? 0) + 1);
            } else {
              setMyRank(null);
            }
          } else {
            setMyPoints(null);
            setMyRank(null);
            setMyName(null);
            setMyStats(null);
          }
        } else {
          setMyPoints(null);
          setMyRank(null);
          setMyName(null);
          setMyStats(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "알 수 없는 오류";
        setError(msg);
        setRows([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const weekStartLabel = formatCalendarDateForDisplay(getUtcWeekStartDateString());

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  const weeklyTop3 = weeklyRows.slice(0, 3);
  const weeklyRest = weeklyRows.slice(3);

  const showCumulative = tab === "cumulative";
  const showWeekly = tab === "weekly";

  const cumulativeReady = !loading && !error && rows.length > 0;
  const weeklyReady = !loading && !weeklyError && weeklyRows.length > 0;
  const weeklyEmptyOk = !loading && !weeklyError && weeklyRows.length === 0;

  return (
    <div className="min-h-screen bg-[#07080c] pb-32 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 pb-6 pt-8 sm:px-6">
        <Link
          href="/"
          className="text-sm text-zinc-500 transition hover:text-amber-200/90"
        >
          ← 메인
        </Link>

        <header className="mt-6 text-center sm:mt-8">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-amber-500/90">
            Hall of fame
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            랭킹
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            누적 포인트의 명예와 이번 주 가장 활발한 활동을 함께 확인하세요.
          </p>

          <div
            className="mx-auto mt-8 flex max-w-md justify-center gap-1 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-1"
            role="tablist"
            aria-label="랭킹 종류"
          >
            <button
              type="button"
              role="tab"
              aria-selected={showCumulative}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                showCumulative
                  ? "bg-amber-500/15 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              onClick={() => setTab("cumulative")}
            >
              누적 랭킹
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showWeekly}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                showWeekly
                  ? "bg-emerald-500/15 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.28)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              onClick={() => setTab("weekly")}
            >
              주간 라이징 스타
            </button>
          </div>

          {showCumulative ? (
            <p className="mx-auto mt-4 max-w-lg text-sm text-zinc-500">
              누적 포인트 상위 {LIMIT}명 · 승인된 게시글 기준 활동 지표입니다.
            </p>
          ) : (
            <p className="mx-auto mt-4 max-w-lg text-sm text-zinc-500">
              집계 기간: {weekStartLabel} (UTC) ~ 지금 · 승인된 활동의 기본 점수와 예상 보너스(Sync·조회)를
              합산합니다.
            </p>
          )}
        </header>

        {loading ? (
          <p className="mt-16 text-center text-sm text-zinc-500">불러오는 중…</p>
        ) : showCumulative && error ? (
          <p className="mt-10 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-center text-sm text-red-100">
            {error}
          </p>
        ) : showCumulative && rows.length === 0 ? (
          <p className="mt-16 text-center text-sm text-zinc-500">아직 랭킹 데이터가 없습니다.</p>
        ) : showWeekly && weeklyError ? (
          <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-emerald-500/20 bg-emerald-950/25 px-5 py-8 text-center">
            <p className="text-sm font-medium text-emerald-100/95">{WEEKLY_RANKING_FALLBACK_MESSAGE}</p>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              잠시 후 다시 시도해 주세요. (마이그레이션 미적용·스키마 캐시 지연일 수 있습니다)
            </p>
            <p className="mt-2 font-mono text-[10px] text-zinc-600">{weeklyError}</p>
          </div>
        ) : showWeekly && weeklyEmptyOk ? (
          <p className="mt-16 text-center text-sm text-zinc-500">
            이번 주 아직 집계할 승인 활동이 없습니다.
          </p>
        ) : showCumulative && cumulativeReady ? (
          <>
            <section className="mx-auto mt-10 w-full max-w-5xl sm:mt-12">
              <div className="grid grid-cols-3 items-end gap-3 sm:gap-5 md:gap-8">
                <PodiumCard
                  rank={1}
                  name={displayName(top3[0]?.nickname)}
                  points={top3[0]?.total_points}
                  pointsTone="amber"
                  subtitle={top3[0] ? formatStatLine(top3[0]) : undefined}
                  highlight="gold"
                  emphasized
                />
                <PodiumCard
                  rank={2}
                  name={displayName(top3[1]?.nickname)}
                  points={top3[1]?.total_points}
                  pointsTone="amber"
                  subtitle={top3[1] ? formatStatLine(top3[1]) : undefined}
                  highlight="silver"
                />
                <PodiumCard
                  rank={3}
                  name={displayName(top3[2]?.nickname)}
                  points={top3[2]?.total_points}
                  pointsTone="amber"
                  subtitle={top3[2] ? formatStatLine(top3[2]) : undefined}
                  highlight="bronze"
                />
              </div>
              {rows.length < 3 ? (
                <p className="mt-6 text-center text-xs text-zinc-600">
                  표시할 유저가 3명 미만입니다.
                </p>
              ) : null}
            </section>

            <section className="mt-12">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                전체 순위
              </h2>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/30">
                <div className="hidden border-b border-white/10 px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5rem_4rem_4rem] sm:gap-2 sm:px-4 sm:text-xs">
                  <span>#</span>
                  <span>닉네임 · 활동</span>
                  <span className="text-right">누적 pt</span>
                  <span className="text-right">게시글</span>
                  <span className="text-right">Sync</span>
                  <span className="text-right">조회</span>
                </div>
                <ul className="divide-y divide-white/[0.05]">
                  {rest.map((p, i) => {
                    const rank = i + 4;
                    return (
                      <li key={p.id} className="px-3 py-3 sm:px-4">
                        <div className="grid grid-cols-[2rem_1fr] gap-2 sm:hidden">
                          <span className="tabular-nums text-sm text-zinc-400">{rank}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-100">{displayName(p.nickname)}</p>
                            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                              {formatStatLine(p)}
                            </p>
                            <p className="mt-1 text-sm tabular-nums text-amber-200/95">
                              {p.total_points.toLocaleString("ko-KR")} pt
                            </p>
                          </div>
                        </div>
                        <div className="hidden items-center sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5rem_4rem_4rem] sm:gap-2">
                          <span className="tabular-nums text-sm text-zinc-400">{rank}</span>
                          <div className="min-w-0">
                            <span className="font-medium text-zinc-100">
                              {displayName(p.nickname)}
                            </span>
                            <p className="mt-0.5 text-[11px] text-zinc-500">{formatStatLine(p)}</p>
                          </div>
                          <span className="text-right text-sm tabular-nums text-amber-200/95">
                            {p.total_points.toLocaleString("ko-KR")}
                          </span>
                          <span className="text-right text-sm tabular-nums text-zinc-300">
                            {p.postCount.toLocaleString("ko-KR")}
                          </span>
                          <span className="text-right text-sm tabular-nums text-zinc-300">
                            {p.syncCount.toLocaleString("ko-KR")}
                          </span>
                          <span className="text-right text-sm tabular-nums text-zinc-300">
                            {p.viewSum.toLocaleString("ko-KR")}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  {rows.length <= 3 && rows.length > 0 ? (
                    <li className="px-4 py-6 text-center text-xs text-zinc-600">
                      4위 이하는 유저 수가 적어 목록에 없습니다.
                    </li>
                  ) : null}
                </ul>
              </div>
              <p className="mt-3 text-center text-[11px] text-zinc-600">
                게시글·조회·Sync는 승인된 활동 인증 기준입니다.
              </p>
            </section>
          </>
        ) : showWeekly && weeklyReady ? (
          <>
            <section className="mx-auto mt-10 w-full max-w-5xl sm:mt-12">
              <div className="grid grid-cols-3 items-end gap-3 sm:gap-5 md:gap-8">
                <PodiumCard
                  rank={1}
                  name={displayName(weeklyTop3[0]?.display_name)}
                  points={weeklyTop3[0]?.weekly_points}
                  pointsTone="emerald"
                  subtitle={weeklyTop3[0] ? formatWeeklyActivitySubtitle(weeklyTop3[0]) : undefined}
                  highlight="gold"
                  emphasized
                  emeraldFlare
                />
                <PodiumCard
                  rank={2}
                  name={displayName(weeklyTop3[1]?.display_name)}
                  points={weeklyTop3[1]?.weekly_points}
                  pointsTone="emerald"
                  subtitle={weeklyTop3[1] ? formatWeeklyActivitySubtitle(weeklyTop3[1]) : undefined}
                  highlight="silver"
                />
                <PodiumCard
                  rank={3}
                  name={displayName(weeklyTop3[2]?.display_name)}
                  points={weeklyTop3[2]?.weekly_points}
                  pointsTone="emerald"
                  subtitle={weeklyTop3[2] ? formatWeeklyActivitySubtitle(weeklyTop3[2]) : undefined}
                  highlight="bronze"
                />
              </div>
              {weeklyRows.length < 3 ? (
                <p className="mt-6 text-center text-xs text-zinc-600">
                  표시할 유저가 3명 미만입니다.
                </p>
              ) : null}
            </section>

            <section className="mt-12">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                전체 순위
              </h2>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/30">
                <div className="hidden border-b border-white/10 px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5rem_4rem_4rem] sm:gap-2 sm:px-4 sm:text-xs">
                  <span>#</span>
                  <span>닉네임 · 활동</span>
                  <span className="text-right">주간 pt</span>
                  <span className="text-right">게시글</span>
                  <span className="text-right">Sync</span>
                  <span className="text-right">조회</span>
                </div>
                <ul className="divide-y divide-white/[0.05]">
                  {weeklyRest.map((p, i) => {
                    const rank = i + 4;
                    return (
                      <li key={p.user_id} className="px-3 py-3 sm:px-4">
                        <div className="grid grid-cols-[2rem_1fr] gap-2 sm:hidden">
                          <span className="tabular-nums text-sm text-zinc-400">{rank}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-100">{displayName(p.display_name)}</p>
                            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                              {formatWeeklyActivitySubtitle(p)}
                            </p>
                            <p className="mt-1 text-sm tabular-nums text-emerald-200/95">
                              {p.weekly_points.toLocaleString("ko-KR")} pt
                            </p>
                          </div>
                        </div>
                        <div className="hidden items-center sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5rem_4rem_4rem] sm:gap-2">
                          <span className="tabular-nums text-sm text-zinc-400">{rank}</span>
                          <div className="min-w-0">
                            <span className="font-medium text-zinc-100">
                              {displayName(p.display_name)}
                            </span>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              {formatWeeklyActivitySubtitle(p)}
                            </p>
                          </div>
                          <span className="text-right text-sm tabular-nums text-emerald-200/95">
                            {p.weekly_points.toLocaleString("ko-KR")}
                          </span>
                          <span className="text-right text-sm tabular-nums text-zinc-300">
                            {p.week_post_count.toLocaleString("ko-KR")}
                          </span>
                          <span className="text-right text-sm tabular-nums text-zinc-300">
                            {p.week_sync_received.toLocaleString("ko-KR")}
                          </span>
                          <span className="text-right text-sm tabular-nums text-zinc-300">
                            {p.week_view_sum.toLocaleString("ko-KR")}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  {weeklyRows.length <= 3 && weeklyRows.length > 0 ? (
                    <li className="px-4 py-6 text-center text-xs text-zinc-600">
                      4위 이하는 유저 수가 적어 목록에 없습니다.
                    </li>
                  ) : null}
                </ul>
              </div>
              <p className="mt-3 text-center text-[11px] text-zinc-600">
                주간 포인트는 승인된 활동의 기본 점수와, 현재까지의 Sync·조회를 반영한 예상 보너스입니다.
              </p>
            </section>
          </>
        ) : null}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-zinc-950/95 px-4 py-3 shadow-[0_-8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto max-w-5xl">
          {loading ? (
            <p className="w-full text-center text-sm text-zinc-500">순위 불러오는 중…</p>
          ) : !meId ? (
            <p className="w-full text-center text-sm text-zinc-400">
              <Link href="/login?next=/leaderboard" className="text-amber-400 underline">
                로그인
              </Link>
              하고 내 순위를 확인하세요
            </p>
          ) : tab === "cumulative" && myRank != null && myPoints != null && myStats ? (
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  내 누적 순위
                </p>
                <p className="truncate text-sm font-semibold text-white">
                  {displayName(myName)}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{formatStatLine(myStats)}</p>
                <p className="mt-1 text-sm tabular-nums text-amber-200">
                  {myPoints.toLocaleString("ko-KR")} pt
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold tabular-nums text-white">{myRank}</p>
                <p className="text-[10px] text-zinc-500">위</p>
              </div>
            </div>
          ) : tab === "weekly" ? (
            weeklyPlaceErr ? (
              <div className="w-full text-center">
                <p className="text-sm font-medium text-emerald-100/90">{WEEKLY_RANKING_FALLBACK_MESSAGE}</p>
                <p className="mt-1 text-[10px] text-zinc-600">{weeklyPlaceErr}</p>
              </div>
            ) : weeklyMyPlace ? (
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-500/90">
                    내 주간 순위 · 라이징 스타
                  </p>
                  <p className="truncate text-sm font-semibold text-white">
                    {displayName(myName)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    이번 주 Sync {weeklyMyPlace.week_sync_received.toLocaleString("ko-KR")}개 획득
                  </p>
                  <p className="mt-1 text-sm tabular-nums text-emerald-200">
                    {weeklyMyPlace.weekly_points.toLocaleString("ko-KR")} pt
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold tabular-nums text-white">
                    {weeklyMyPlace.rank}
                  </p>
                  <p className="text-[10px] text-zinc-500">위</p>
                </div>
              </div>
            ) : (
              <p className="w-full text-center text-sm text-zinc-400">
                이번 주 아직 집계된 활동이 없어 주간 순위가 없습니다.
              </p>
            )
          ) : (
            <p className="w-full text-center text-sm text-zinc-500">
              내 순위를 불러오지 못했습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function borderClass(highlight: "gold" | "silver" | "bronze") {
  switch (highlight) {
    case "gold":
      return "border-amber-300/90 shadow-[0_0_28px_-4px_rgba(251,191,36,0.45)]";
    case "silver":
      return "border-zinc-300/80";
    case "bronze":
      return "border-amber-800/70";
    default:
      return "border-white/15";
  }
}

function PodiumCard({
  rank,
  name,
  points,
  subtitle,
  highlight,
  emphasized,
  pointsTone,
  emeraldFlare,
}: {
  rank: 1 | 2 | 3;
  name: string;
  points: number | undefined;
  subtitle?: string;
  highlight: "gold" | "silver" | "bronze";
  emphasized?: boolean;
  pointsTone: "amber" | "emerald";
  emeraldFlare?: boolean;
}) {
  const empty = points == null;
  const isGold = highlight === "gold";
  const ptClass =
    pointsTone === "emerald" ? "text-emerald-200/95" : "text-amber-200/90";

  const emeraldRing =
    emeraldFlare &&
    "border-emerald-400/70 shadow-[0_0_40px_-4px_rgba(52,211,153,0.55),0_0_80px_-20px_rgba(16,185,129,0.35)] ring-2 ring-emerald-400/45";

  return (
    <div
      className={`flex min-h-[176px] w-full min-w-0 flex-col rounded-2xl border-2 bg-gradient-to-b from-zinc-900/90 to-zinc-950 px-3 py-3 sm:min-h-[232px] sm:px-4 sm:py-5 ${
        emeraldFlare ? emeraldRing : borderClass(highlight)
      } ${
        isGold && !emeraldFlare ? "ring-2 ring-amber-400/25" : ""
      } ${
        emphasized && !emeraldFlare
          ? "z-10 shadow-[0_0_36px_-6px_rgba(251,191,36,0.55)] sm:scale-[1.03] sm:px-5 sm:py-6"
          : emphasized && emeraldFlare
            ? "z-10 sm:scale-[1.03] sm:px-5 sm:py-6"
            : "opacity-[0.98]"
      }`}
    >
      <div className="flex min-w-0 flex-col items-center text-center [word-break:keep-all]">
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums sm:h-10 sm:w-10 sm:text-sm ${
            emeraldFlare
              ? "bg-emerald-500/25 text-emerald-100"
              : rank === 1
                ? "bg-amber-400/20 text-amber-100"
                : rank === 2
                  ? "bg-zinc-400/15 text-zinc-200"
                  : "bg-amber-900/40 text-amber-200/90"
          }`}
        >
          {rank}
        </span>
        <p className="mt-2 w-full max-w-full px-1 text-sm font-semibold leading-snug text-white sm:mt-3 sm:text-base">
          {empty ? "—" : name}
        </p>
        <p className={`mt-1 shrink-0 tabular-nums text-xs sm:text-lg ${ptClass}`}>
          {empty ? "—" : `${points.toLocaleString("ko-KR")} pt`}
        </p>
        {!empty && subtitle ? (
          <p className="mt-2.5 w-full max-w-full px-0.5 text-center text-[10px] leading-relaxed text-zinc-400 sm:text-[11px] sm:leading-normal">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
