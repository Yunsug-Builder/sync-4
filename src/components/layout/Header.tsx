"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LanguageCode } from "@/components/home/FeedCard";
import { useLanguage } from "@/components/providers/LanguageProvider";

const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; label: string }> = [
  { code: "KO", label: "한국어" },
  { code: "EN", label: "English" },
  { code: "ZH", label: "中文" },
  { code: "JA", label: "日本語" },
];

export function Header() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-semibold tracking-wide text-zinc-100">
          SYNC
        </Link>
        <div className="flex items-center gap-2">
          <div className="relative" ref={wrapRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs font-semibold text-zinc-200"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              {language}
            </button>
            {open ? (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-36 rounded-lg border border-zinc-800 bg-zinc-950/90 p-1 shadow-xl backdrop-blur-sm"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => {
                      void setLanguage(option.code);
                      setOpen(false);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                      language === option.code
                        ? "text-fuchsia-500"
                        : "text-zinc-300 hover:bg-zinc-800/80"
                    }`}
                    role="menuitem"
                  >
                    <span>{option.label}</span>
                    {language === option.code ? <span aria-hidden>✓</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            href="/profile"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white"
            aria-label="마이페이지"
          >
            <User className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

