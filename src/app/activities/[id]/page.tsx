"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityCommentsSection } from "@/components/activities/ActivityCommentsSection";
import { ActivityRewardSection } from "@/components/activities/ActivityRewardSection";
import { ActivitySyncControl } from "@/components/activities/ActivitySyncControl";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Row = {
  id: string;
  user_id: string;
  content: string;
  proof_url: string | null;
  status: string;
  created_at: string;
  view_count?: number;
  is_settled?: boolean;
  profiles: unknown;
  activity_types: unknown;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type DetailData = {
  authorUserId: string;
  content: string;
  proofUrl: string | null;
  nickname: string;
  activityName: string;
  vibes: number;
  status: string;
  viewCount: number;
  isSettled: boolean;
};

export default function ActivityDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const viewBumpForIdRef = useRef<string | null>(null);

  useEffect(() => {
    viewBumpForIdRef.current = null;
  }, [id]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetailData | null>(null);
  const [syncCount, setSyncCount] = useState(0);
  /** `undefined`: 아직 세션 확인 전, `null`: 비로그인, 문자열: 로그인 uid */
  const [viewerUserId, setViewerUserId] = useState<string | null | undefined>(
    undefined
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setViewerUserId(user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setViewerUserId(session?.user?.id ?? null);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!id.trim()) {
      void (async () => {
        setLoading(false);
        setError("잘못된 주소입니다.");
        setData(null);
      })();
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    void (async () => {
      setLoading(true);
      setError(null);
      setData(null);
      setSyncCount(0);

      const { data: row, error: qErr } = await supabase
        .from("activity_logs")
        .select(
          `
          id,
          user_id,
          content,
          proof_url,
          status,
          created_at,
          view_count,
          is_settled,
          profiles ( nickname ),
          activity_types ( name, base_vibes )
        `
        )
        .eq("id", id.trim())
        .maybeSingle();

      if (cancelled) return;

      if (qErr) {
        setError(qErr.message);
        setData(null);
        setLoading(false);
        return;
      }

      if (!row) {
        setError(null);
        setData(null);
        setLoading(false);
        return;
      }

      const r = row as Row;
      const prof = firstOrNull(r.profiles as { nickname: string | null } | null);
      const at = firstOrNull(
        r.activity_types as { name: string; base_vibes?: number } | null
      );

      const vc =
        typeof r.view_count === "number" && !Number.isNaN(r.view_count)
          ? r.view_count
          : 0;

      setData({
        authorUserId: r.user_id,
        content: r.content ?? "",
        proofUrl: r.proof_url,
        nickname: prof?.nickname?.trim() || "익명",
        activityName: at?.name?.trim() || "활동",
        vibes: typeof at?.base_vibes === "number" ? at.base_vibes : 0,
        status: r.status,
        viewCount: vc,
        isSettled: Boolean(r.is_settled),
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id.trim() || !data || data.status !== "approved") {
      return;
    }
    if (viewBumpForIdRef.current === id) {
      return;
    }
    viewBumpForIdRef.current = id;

    const supabase = getSupabaseBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;

      if (uid == null) {
        return;
      }
      if (uid === data.authorUserId) {
        return;
      }

      const { error: rpcErr } = await supabase.rpc("increment_view_count_v2", {
        p_log_id: id.trim(),
        p_user_id: uid,
      });
      if (rpcErr) {
        return;
      }
      const { data: vcRow } = await supabase
        .from("activity_logs")
        .select("view_count")
        .eq("id", id.trim())
        .maybeSingle();
      const nextVc =
        vcRow && typeof (vcRow as { view_count?: number }).view_count === "number"
          ? (vcRow as { view_count: number }).view_count
          : null;
      if (nextVc != null) {
        setData((d) => (d ? { ...d, viewCount: nextVc } : d));
      }
    })();
  }, [id, data]);

  const isApproved = data?.status === "approved";

  const refreshSyncCount = useCallback(() => {
    if (!id.trim()) return;
    const supabase = getSupabaseBrowserClient();
    void supabase
      .from("activity_syncs")
      .select("*", { count: "exact", head: true })
      .eq("activity_id", id.trim())
      .then(({ count, error }) => {
        if (!error) {
          setSyncCount(count ?? 0);
        }
      });
  }, [id]);

  useEffect(() => {
    if (!id.trim() || data?.status !== "approved") {
      return;
    }
    refreshSyncCount();
    const t = window.setInterval(refreshSyncCount, 4000);
    return () => window.clearInterval(t);
  }, [id, data?.status, refreshSyncCount]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
        >
          <span aria-hidden>←</span>
          메인 피드로
        </Link>

        {loading ? (
          <p className="mt-12 text-sm text-zinc-500">불러오는 중…</p>
        ) : error ? (
          <p className="mt-12 rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100">
            {error}
          </p>
        ) : !data ? (
          <div className="mt-12 rounded-2xl border border-white/10 bg-zinc-900/50 p-8 text-center">
            <p className="text-lg font-medium text-zinc-200">인증을 찾을 수 없습니다</p>
            <p className="mt-2 text-sm text-zinc-500">
              삭제되었거나 볼 권한이 없을 수 있어요.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-medium text-zinc-950"
            >
              메인으로 돌아가기
            </Link>
          </div>
        ) : (
          <article className="mt-10">
            <header className="space-y-4 border-b border-white/10 pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-1 text-sm font-medium text-fuchsia-100">
                  {data.activityName}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    작성자
                  </p>
                  <p className="mt-1 text-xl font-semibold text-white">{data.nickname}</p>
                </div>
                <div className="rounded-2xl border border-sync-purple/40 bg-sync-purple/10 px-5 py-3 text-center sm:text-right">
                  <p className="text-xs font-medium text-zinc-400">획득 VIBE</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-sync-purple">
                    +{data.vibes.toLocaleString("ko-KR")}
                    <span className="ml-1 text-lg font-semibold text-fuchsia-200/80">V</span>
                  </p>
                </div>
              </div>

              {isApproved ? (
                <p className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-sm text-zinc-500">
                  <span>
                    조회{" "}
                    <span className="tabular-nums font-medium text-zinc-300">
                      {data.viewCount.toLocaleString("ko-KR")}
                    </span>
                    회
                  </span>
                  {viewerUserId === null ? (
                    <span className="text-[10px] leading-tight text-zinc-600">
                      로그인 후 Sync와 조회가 가능합니다
                    </span>
                  ) : null}
                </p>
              ) : null}
            </header>

            <div className="py-10">
              <p className="whitespace-pre-wrap text-lg leading-relaxed text-zinc-100 sm:text-xl sm:leading-relaxed">
                {data.content}
              </p>
            </div>

            {isApproved ? (
              <section className="border-t border-white/10 pt-8">
                <ActivitySyncControl
                  activityLogId={id.trim()}
                  isApproved={isApproved}
                  authorUserId={data.authorUserId}
                  onCountsUpdated={refreshSyncCount}
                />
              </section>
            ) : null}

            {isApproved ? (
              <ActivityRewardSection
                baseVibes={data.vibes}
                viewCount={data.viewCount}
                syncCount={syncCount}
                isSettled={data.isSettled}
                isApproved={isApproved}
              />
            ) : null}

            <footer className="border-t border-white/10 pt-8">
              {data.proofUrl && data.proofUrl.trim().length > 0 ? (
                <a
                  href={data.proofUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/15 bg-zinc-900 px-6 text-sm font-medium text-white transition hover:border-fuchsia-400/40"
                >
                  원문 보러가기
                </a>
              ) : (
                <p className="text-sm text-zinc-500">등록된 원문 링크가 없습니다.</p>
              )}
            </footer>

            {isApproved ? (
              <ActivityCommentsSection activityLogId={id.trim()} isApproved={isApproved} />
            ) : null}
          </article>
        )}
      </div>
    </div>
  );
}
