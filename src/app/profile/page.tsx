"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Passport, { type ActiveInventoryItem } from "@/components/Passport";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { estimatedBonusVibes } from "@/lib/rewards";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [activeItems, setActiveItems] = useState<ActiveInventoryItem[]>([]);
  const [passportStamps, setPassportStamps] = useState<
    Array<{ id: string; label: string; visited: boolean }>
  >([]);
  const [totalVibes, setTotalVibes] = useState<number | null>(null);
  const [expectedBonusVibesSum, setExpectedBonusVibesSum] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setLoading(true);
    setLoadError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setLoggedIn(false);
      setNickname(null);
      setAvatarUrl(null);
      setActiveItems([]);
      setPassportStamps([]);
      setTotalVibes(null);
      setExpectedBonusVibesSum(null);
      setLoading(false);
      return;
    }

    setLoggedIn(true);

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("nickname, avatar_url, total_vibes")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      setLoadError(profileErr.message);
      setNickname(null);
      setAvatarUrl(null);
      setActiveItems([]);
      setPassportStamps([]);
      setTotalVibes(null);
      setExpectedBonusVibesSum(null);
      setLoading(false);
      return;
    }

    const tp =
      typeof (profile as { total_vibes?: number } | null)?.total_vibes === "number"
        ? (profile as { total_vibes: number }).total_vibes
        : 0;
    const nn = typeof (profile as { nickname?: string } | null)?.nickname === "string" ? (profile as { nickname: string }).nickname : null;
    const av =
      typeof (profile as { avatar_url?: string | null } | null)?.avatar_url === "string"
        ? (profile as { avatar_url: string }).avatar_url
        : null;
    setNickname(nn?.trim() || null);
    setAvatarUrl(av?.trim() || null);
    setTotalVibes(tp);

    const [{ data: logs, error: qErr }, { data: equippedRows, error: equippedErr }] = await Promise.all([
      supabase
        .from("activity_logs")
        .select("id, view_count")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .eq("is_settled", false),
      supabase
        .from("user_inventory")
        .select(
          `
          id,
          shop_items (
            id,
            name,
            category
          )
        `
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("purchased_at", { ascending: false }),
    ]);

    if (equippedErr) {
      setLoadError(equippedErr.message);
      setActiveItems([]);
      setPassportStamps([]);
      setExpectedBonusVibesSum(null);
      setLoading(false);
      return;
    }

    const normalizedActiveItems: ActiveInventoryItem[] = (equippedRows ?? [])
      .map((row) => {
        const rawItem = (row as { shop_items?: unknown }).shop_items;
        const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;
        if (!item || typeof item !== "object") return null;
        const candidate = item as { id?: string; name?: string; category?: string | null };
        if (!candidate.id || !candidate.name) return null;
        return {
          id: candidate.id,
          name: candidate.name,
          category: candidate.category ?? null,
        };
      })
      .filter((item): item is ActiveInventoryItem => item !== null);
    setActiveItems(normalizedActiveItems);

    if (qErr) {
      setLoadError(qErr.message);
      setPassportStamps([]);
      setExpectedBonusVibesSum(null);
      setLoading(false);
      return;
    }

    const normalizedLogs = (logs ?? []) as Array<{ id: string; view_count?: number }>;
    const newStamps = Array.from({ length: 9 }).map((_, idx) => {
      const hasVisited = idx < normalizedLogs.length;
      return {
        id: hasVisited ? normalizedLogs[idx].id : `passport-empty-${idx + 1}`,
        label: hasVisited ? `인증 완료 ${idx + 1}` : `빈 스탬프 ${idx + 1}`,
        visited: hasVisited,
      };
    });
    setPassportStamps(newStamps);

    let sum = 0;
    for (const row of normalizedLogs) {
      const { count } = await supabase
        .from("activity_syncs")
        .select("*", { count: "exact", head: true })
        .eq("activity_id", row.id);

      const vc =
        typeof row.view_count === "number" && !Number.isNaN(row.view_count)
          ? row.view_count
          : 0;
      sum += estimatedBonusVibes(count ?? 0, vc);
    }

    setExpectedBonusVibesSum(sum);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadProfile());
  }, [loadProfile]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        window.location.reload();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-white">프로필</h1>
          {loggedIn ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadProfile()}
              className="shrink-0 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-sync-purple/40 hover:text-white disabled:opacity-50"
            >
              {loading ? "불러오는 중…" : "VIBE 새로고침"}
            </button>
          ) : null}
        </div>

        {!loading && !loggedIn ? (
          <p className="mt-6 text-sm text-zinc-400">
            로그인 후 마이페이지 기능을 이용할 수 있어요.{" "}
            <Link href="/login?next=/profile" className="text-sync-purple underline">
              로그인
            </Link>
          </p>
        ) : null}

        {loadError ? (
          <p className="mt-6 text-sm text-red-300">{loadError}</p>
        ) : null}

        {loggedIn ? (
          <>
            <section className="mt-8">
              <Passport
                artistName={nickname ?? "SYNC 회원"}
                levelTitle="SYNC 팬 패스포트"
                stamps={passportStamps}
                avatarUrl={avatarUrl}
                activeItems={activeItems}
              />
            </section>

            <section className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/50 px-5 py-5">
              <h2 className="text-sm font-semibold text-zinc-300">누적 VIBE (total_vibes)</h2>
              <p className="mt-3 text-3xl font-bold tabular-nums text-white">
                {loading && totalVibes == null
                  ? "…"
                  : (totalVibes ?? 0).toLocaleString("ko-KR")}
                <span className="ml-1 text-base font-medium text-zinc-400">V</span>
              </p>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                승인 시 기본 점수와 주간 정산으로 반영된 가중 보너스 VIBE가 합산된 값입니다.
                정산 직후 위의 「VIBE 새로고침」으로 최신 값을 확인하세요.
              </p>
            </section>

            <section className="mt-6 rounded-2xl border border-sync-purple/25 bg-sync-purple/5 px-5 py-5">
              <h2 className="text-sm font-semibold text-sync-purple">
                이번 주 획득 예정 VIBE
              </h2>
              <p className="mt-3 text-3xl font-bold tabular-nums text-white">
                {loading
                  ? "…"
                  : expectedBonusVibesSum != null
                    ? `+${expectedBonusVibesSum.toLocaleString("ko-KR")}`
                    : "0"}
                <span className="ml-1 text-base font-medium text-zinc-400">V</span>
              </p>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                승인되었고 아직 정산되지 않은 내 활동의 예상 가중 보너스 합계입니다. (Sync×5 +
                조회÷10)
              </p>
              <p className="mt-4 text-xs text-zinc-500">매주 월요일 정기 정산이 진행됩니다.</p>
            </section>

            <Link
              href="/settlements"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl border border-white/15 px-5 text-sm font-medium text-zinc-200 transition hover:border-sync-purple/40 hover:text-white"
            >
              정산 이력 보기
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
