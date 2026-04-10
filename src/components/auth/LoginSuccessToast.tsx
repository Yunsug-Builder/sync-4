"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ToastKind = "auth" | "submission" | null;

const FADE_MS = 500;
const VISIBLE_MS = 5000;

function LoginSuccessToastInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toastKind, setToastKind] = useState<ToastKind>(null);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [message, setMessage] = useState("");

  // URL 쿼리만 감지해 종류를 고정합니다. router.replace 로 쿼리가 사라져도 toastKind 는 유지되어 타이머가 끊기지 않습니다.
  useEffect(() => {
    const auth = searchParams.get("auth") === "success";
    const submission = searchParams.get("submission") === "success";
    if (submission) {
      setToastKind("submission");
    } else if (auth) {
      setToastKind("auth");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!toastKind) {
      return;
    }

    setMessage(
      toastKind === "submission"
        ? "인증요청이 완료되었습니다."
        : "로그인 성공"
    );
    setVisible(true);
    setExiting(false);
    router.replace("/", { scroll: false });

    const fadeTimer = window.setTimeout(() => {
      setExiting(true);
    }, VISIBLE_MS);

    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      setExiting(false);
      setToastKind(null);
    }, VISIBLE_MS + FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [toastKind, router]);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-8 left-1/2 z-50 w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl border border-white/15 bg-zinc-900/95 px-4 py-3 text-center text-sm font-medium text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md transition-opacity ease-out ${exiting ? "opacity-0 duration-500" : "opacity-100 duration-300"}`}
    >
      {message}
    </div>
  );
}

export function LoginSuccessToast() {
  return (
    <Suspense fallback={null}>
      <LoginSuccessToastInner />
    </Suspense>
  );
}
