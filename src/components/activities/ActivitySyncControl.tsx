"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Props = {
  activityLogId: string;
  isApproved: boolean;
  /** activity_logs.user_id — 본인 글이면 Sync 불가 */
  authorUserId: string | null;
  /** Sync 토글 직후 상위(예: 리워드 추정치)에서 카운트를 바로 갱신할 때 */
  onCountsUpdated?: () => void;
};

export function ActivitySyncControl({
  activityLogId,
  isApproved,
  authorUserId,
  onCountsUpdated,
}: Props) {
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [synced, setSynced] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const loginHref = `/login?next=${encodeURIComponent(`/activities/${activityLogId}`)}`;

  const isOwnPost =
    Boolean(viewerId) && Boolean(authorUserId) && viewerId === authorUserId;

  const loadSyncState = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id ?? null;
    setViewerId(uid);
    setHasSession(Boolean(uid));

    const { count: c, error: countErr } = await supabase
      .from("activity_syncs")
      .select("*", { count: "exact", head: true })
      .eq("activity_id", activityLogId);

    if (!countErr) {
      setCount(c ?? 0);
    }

    if (uid) {
      const { data: row } = await supabase
        .from("activity_syncs")
        .select("id")
        .eq("activity_id", activityLogId)
        .eq("user_id", uid)
        .maybeSingle();
      setSynced(Boolean(row));
    } else {
      setSynced(false);
    }

    setLoading(false);
  }, [activityLogId]);

  useEffect(() => {
    if (!isApproved) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      await loadSyncState();
      if (cancelled) return;
    })();

    const supabase = getSupabaseBrowserClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void loadSyncState();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [activityLogId, isApproved, loadSyncState]);

  const onSyncClick = useCallback(async () => {
    if (!isApproved || isOwnPost) return;
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      router.push(loginHref);
      return;
    }

    setPending(true);
    try {
      if (synced) {
        const { error } = await supabase
          .from("activity_syncs")
          .delete()
          .eq("activity_id", activityLogId)
          .eq("user_id", user.id);
        if (!error) {
          await loadSyncState();
          onCountsUpdated?.();
        }
      } else {
        const { error } = await supabase.from("activity_syncs").insert({
          activity_id: activityLogId,
          user_id: user.id,
        });
        if (!error) {
          await loadSyncState();
          onCountsUpdated?.();
        }
      }
    } finally {
      setPending(false);
    }
  }, [
    activityLogId,
    isApproved,
    isOwnPost,
    synced,
    router,
    loginHref,
    loadSyncState,
    onCountsUpdated,
  ]);

  if (!isApproved) {
    return null;
  }

  const syncDisabled = loading || pending || isOwnPost;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onSyncClick()}
          disabled={syncDisabled}
          title={
            isOwnPost
              ? "내 활동에는 Sync할 수 없습니다"
              : "이 활동에 Sync하기"
          }
          aria-label={
            isOwnPost
              ? "내 활동에는 Sync할 수 없습니다"
              : "이 활동에 Sync하기"
          }
          aria-pressed={synced}
          className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            isOwnPost
              ? "border-white/10 bg-zinc-900/50 text-zinc-500"
              : synced
                ? "border-fuchsia-500/70 bg-fuchsia-600/25 text-fuchsia-50 shadow-[0_0_24px_rgba(192,38,211,0.28)]"
                : "border-white/15 bg-zinc-900/80 text-zinc-200 hover:border-fuchsia-400/45 hover:text-white"
          }`}
        >
          <RefreshCw
            className={`h-4 w-4 shrink-0 ${synced && !isOwnPost ? "text-fuchsia-200" : "text-zinc-400"}`}
            strokeWidth={2}
          />
          Sync
        </button>
        <div className="text-sm text-zinc-500">
          <span className="tabular-nums text-zinc-300">
            {loading ? "…" : (count ?? 0).toLocaleString("ko-KR")}
          </span>
          <span className="ml-1 text-zinc-500">Sync</span>
        </div>
      </div>
      {isOwnPost ? (
        <p className="max-w-sm text-xs text-zinc-500" role="note">
          내 활동에는 Sync할 수 없습니다
        </p>
      ) : !hasSession ? (
        <p className="text-xs text-zinc-500">
          Sync와 댓글은{" "}
          <Link href={loginHref} className="text-fuchsia-300 underline underline-offset-2">
            로그인
          </Link>
          이 필요해요.
        </p>
      ) : null}
    </div>
  );
}
