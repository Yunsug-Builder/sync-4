"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { ProfileNicknameGate } from "@/components/auth/ProfileNicknameGate";
import { RequireAuth } from "@/components/auth/RequireAuth";
import {
  type ArtistRow,
  getArtistDisplayName,
  getArtistId,
  getArtistImageUrl,
} from "@/lib/artists";

export default function HomeClient() {
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase
      .from("artists")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          setLoadError(error.message);
          return;
        }
        setArtists((data ?? []) as ArtistRow[]);
      });
  }, []);

  return (
    <RequireAuth>
      <ProfileNicknameGate>
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-medium tracking-wide text-fuchsia-200">
                  SYNC
                </p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Featured Artists
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
                  아티스트를 선택해 활동 인증을 제출할 수 있습니다.
                </p>
              </div>
              <Link
                href="/activities/submit"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-2xl bg-white px-6 text-sm font-medium text-black transition hover:opacity-90"
              >
                활동 인증하기
              </Link>
            </header>

            {loadError ? (
              <section className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6">
                <p className="text-sm font-medium text-red-200">
                  데이터를 불러오지 못했습니다.
                </p>
                <p className="mt-2 text-sm text-red-100/90">{loadError}</p>
              </section>
            ) : artists.length === 0 ? (
              <section className="rounded-2xl border border-white/15 bg-zinc-900/70 p-8 text-center">
                <p className="text-lg font-medium text-zinc-100">
                  아직 등록된 아티스트가 없습니다.
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  `artists` 테이블에 데이터를 추가한 뒤 새로고침해 보세요.
                </p>
              </section>
            ) : (
              <section
                aria-label="Artists list"
                className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {artists.map((artist, index) => {
                  const name = getArtistDisplayName(artist);
                  const imageUrl = getArtistImageUrl(artist);
                  const id = getArtistId(artist);
                  const key = id ?? `artist-${index}`;

                  return (
                    <article
                      key={key}
                      className="group overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition hover:-translate-y-1 hover:border-fuchsia-300/40"
                    >
                      <div className="relative aspect-[4/5] overflow-hidden bg-zinc-800">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={name}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-sm text-zinc-400">
                            No Image
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                      </div>

                      <div className="p-5">
                        <h2 className="text-xl font-semibold tracking-tight text-white">
                          {name}
                        </h2>
                        <p className="mt-2 text-sm text-zinc-400">
                          활동 인증 제출 시 선택할 수 있어요.
                        </p>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
        </div>
      </ProfileNicknameGate>
    </RequireAuth>
  );
}
