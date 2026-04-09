"use client";

/**
 * 개발 모드에서만 표시. 버튼 클릭 시 API 호출 후 브라우저 Console 에 결과 출력.
 */
export function TestSpotSeedPanel() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-white/20 bg-zinc-950/95 p-3 text-left text-xs text-zinc-200 shadow-xl backdrop-blur">
      <p className="font-medium text-zinc-50">Supabase 테스트</p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
        spots 테이블에 테스트 1건 삽입 후, 응답을 콘솔에 출력합니다.
      </p>
      <button
        type="button"
        className="mt-2 w-full rounded-lg bg-sync-purple/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sync-purple"
        onClick={async () => {
          const res = await fetch("/api/dev/seed-test-spot", { method: "POST" });
          const json = await res.json();
          // eslint-disable-next-line no-console -- 개발용 검증
          console.log("[SYNC seed-test-spot] HTTP", res.status, json);
        }}
      >
        테스트 행 삽입 (Console 확인)
      </button>
    </div>
  );
}
