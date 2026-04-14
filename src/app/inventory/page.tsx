"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ShopItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
};

type InventoryRow = {
  id: string;
  item_id: string;
  is_active: boolean;
  purchased_at: string;
  shop_items: ShopItem | ShopItem[] | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function InventoryPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [totalVibes, setTotalVibes] = useState(0);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setLoggedIn(false);
      setInventory([]);
      setTotalVibes(0);
      setLoading(false);
      return;
    }
    setLoggedIn(true);

    const [{ data: pRow, error: pErr }, { data: invRows, error: invErr }] = await Promise.all([
      supabase.from("profiles").select("total_vibes").eq("id", user.id).maybeSingle(),
      supabase
        .from("user_inventory")
        .select(
          `
          id,
          item_id,
          is_active,
          purchased_at,
          shop_items (
            id, name, description, price, image_url, category
          )
        `
        )
        .eq("user_id", user.id)
        .order("purchased_at", { ascending: false }),
    ]);

    if (pErr) {
      setError(pErr.message);
      setTotalVibes(0);
    } else {
      const n =
        typeof (pRow as { total_vibes?: number } | null)?.total_vibes === "number"
          ? (pRow as { total_vibes: number }).total_vibes
          : 0;
      setTotalVibes(n);
    }

    if (invErr) {
      setError(invErr.message);
      setInventory([]);
    } else {
      setInventory((invRows ?? []) as InventoryRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const onToggleActive = useCallback(
    async (row: InventoryRow) => {
      const supabase = getSupabaseBrowserClient();
      const item = firstOrNull(row.shop_items);
      const category = item?.category ?? null;
      if (!category) {
        toast.error("카테고리 없는 아이템은 적용할 수 없습니다.");
        return;
      }

      setActingId(row.id);
      setError(null);

      if (row.is_active) {
        const { error: offErr } = await supabase
          .from("user_inventory")
          .update({ is_active: false })
          .eq("id", row.id);
        setActingId(null);
        if (offErr) {
          setError(offErr.message);
          toast.error(offErr.message);
          return;
        }
        toast.success("아이템 적용을 해제했습니다.");
        await loadInventory();
        return;
      }

      const sameCategoryInventoryIds = inventory
        .filter((inv) => firstOrNull(inv.shop_items)?.category === category)
        .map((inv) => inv.id);

      if (sameCategoryInventoryIds.length > 0) {
        const { error: resetErr } = await supabase
          .from("user_inventory")
          .update({ is_active: false })
          .in("id", sameCategoryInventoryIds);
        if (resetErr) {
          setActingId(null);
          setError(resetErr.message);
          toast.error(resetErr.message);
          return;
        }
      }

      const { error: onErr } = await supabase
        .from("user_inventory")
        .update({ is_active: true })
        .eq("id", row.id);
      setActingId(null);
      if (onErr) {
        setError(onErr.message);
        toast.error(onErr.message);
        return;
      }
      toast.success("아이템을 프로필에 적용했습니다.");
      await loadInventory();
    },
    [inventory, loadInventory]
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/shop" className="text-sm text-zinc-500 transition hover:text-white">
            ← 상점
          </Link>
          <Link href="/profile" className="text-sm text-zinc-400 transition hover:text-white">
            프로필
          </Link>
        </div>

        <header className="mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-fuchsia-300/90">
            Inventory
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">내 인벤토리</h1>
          <p className="mt-2 text-sm text-zinc-500">
            구매한 아이템을 확인하고, 카테고리별로 하나의 아이템만 적용할 수 있습니다.
          </p>
          <p className="mt-4 text-sm text-zinc-300">
            현재 잔액:{" "}
            <span className="font-semibold tabular-nums text-fuchsia-200">
              {loggedIn ? totalVibes.toLocaleString("ko-KR") : "로그인 필요"} VIBE
            </span>
          </p>
        </header>

        {error ? (
          <p className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        {!loggedIn ? (
          <p className="mt-8 text-sm text-zinc-500">로그인 후 인벤토리를 확인할 수 있어요.</p>
        ) : loading ? (
          <p className="mt-8 text-sm text-zinc-500">불러오는 중…</p>
        ) : inventory.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">구매한 아이템이 없습니다.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {inventory.map((row) => {
              const item = firstOrNull(row.shop_items);
              const active = Boolean(row.is_active);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-900/40 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-zinc-500">{item?.category ?? "기타"}</p>
                    <p className="text-base font-semibold text-white">{item?.name ?? "아이템"}</p>
                    <p className="text-xs text-zinc-500">
                      구매가{" "}
                      {(item?.price ?? 0).toLocaleString("ko-KR")} VIBE · 구매일{" "}
                      {new Date(row.purchased_at).toLocaleString("ko-KR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={actingId === row.id}
                    onClick={() => void onToggleActive(row)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "border border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                        : "border border-white/15 text-zinc-200 hover:border-fuchsia-400/45 hover:text-white"
                    } disabled:opacity-60`}
                  >
                    {actingId === row.id ? "처리 중…" : active ? "적용 해제" : "적용하기"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
