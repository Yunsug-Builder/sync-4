"use client";

import { toast } from "sonner";

/**
 * 개발 모드에서만 표시. 버튼 클릭 시 API 호출 후 토스트로 결과 안내.
 */
export function TestSpotSeedPanel() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-white/20 bg-zinc-950/95 p-3 text-left text-xs text-zinc-200 shadow-xl backdrop-blur">
      <p className="font-medium text-zinc-50">Supabase 테스트</p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
        spots 테이블에 테스트 1건 삽입 후, 결과를 토스트로 표시합니다.
      </p>
      <button
        type="button"
        className="mt-2 w-full rounded-lg bg-sync-purple/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sync-purple"
        onClick={async () => {
          const res = await fetch("/api/dev/seed-test-spot", { method: "POST" });
          const json = (await res.json()) as Record<string, unknown>;
          if (res.ok && json.ok === true) {
            toast.success("테스트 행 삽입 완료");
          } else {
            toast.error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
          }
        }}
      >
        테스트 행 삽입
      </button>
    </div>
  );
}
