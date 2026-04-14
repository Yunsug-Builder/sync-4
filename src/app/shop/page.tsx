"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function ShopPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [totalVibes, setTotalVibes] = useState(0);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const ownedItemIds = useMemo(() => {
    const out = new Set<string>();
    for (const row of inventory) out.add(row.item_id);
    return out;
  }, [inventory]);

  const loadAll = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    const { data: shopRows, error: shopErr } = await supabase
      .from("shop_items")
      .select("id, name, description, price, image_url, category")
      .order("created_at", { ascending: false });

    if (shopErr) {
      setError(shopErr.message);
      setItems([]);
      setInventory([]);
      setTotalVibes(0);
      setLoggedIn(Boolean(user?.id));
      setLoading(false);
      return;
    }

    setItems((shopRows ?? []) as ShopItem[]);

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
    void loadAll();
  }, [loadAll]);

  const onBuy = useCallback(
    async (itemId: string) => {
      const supabase = getSupabaseBrowserClient();
      setBuyingId(itemId);
      setError(null);

      const { data, error: rpcErr } = await supabase.rpc("purchase_item", {
        p_item_id: itemId,
      });

      setBuyingId(null);

      if (rpcErr) {
        setError(rpcErr.message);
        toast.error(rpcErr.message);
        return;
      }

      const payload =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null;
      if (payload && payload.ok === false) {
        const msg = typeof payload.error === "string" ? payload.error : "purchase_failed";
        setError(msg);
        toast.error(msg);
        return;
      }

      const successMsg =
        payload && typeof payload.message === "string" ? payload.message : "구매가 완료되었습니다.";
      toast.success(successMsg);
      await loadAll();
    },
    [loadAll]
  );

  const onActivate = useCallback(
    async (row: InventoryRow) => {
      const supabase = getSupabaseBrowserClient();
      const item = firstOrNull(row.shop_items);
      const category = item?.category ?? null;
      if (!category) {
        setError("카테고리 없는 아이템은 적용할 수 없습니다.");
        return;
      }

      setActivatingId(row.id);
      setError(null);

      if (row.is_active) {
        const { error: offErr } = await supabase
          .from("user_inventory")
          .update({ is_active: false })
          .eq("id", row.id);
        setActivatingId(null);
        if (offErr) {
          setError(offErr.message);
          toast.error(offErr.message);
          return;
        }
        toast.success("아이템 적용을 해제했습니다.");
        await loadAll();
        return;
      }

      // 같은 카테고리의 기존 활성 아이템을 해제 후, 선택 아이템을 활성화합니다.
      const sameCategoryInventoryIds = inventory
        .filter((inv) => firstOrNull(inv.shop_items)?.category === category)
        .map((inv) => inv.id);

      if (sameCategoryInventoryIds.length > 0) {
        const { error: offErr } = await supabase
          .from("user_inventory")
          .update({ is_active: false })
          .in("id", sameCategoryInventoryIds);
        if (offErr) {
          setActivatingId(null);
          setError(offErr.message);
          toast.error(offErr.message);
          return;
        }
      }

      const { error: onErr } = await supabase
        .from("user_inventory")
        .update({ is_active: true })
        .eq("id", row.id);

      setActivatingId(null);

      if (onErr) {
        setError(onErr.message);
        toast.error(onErr.message);
        return;
      }
      toast.success("아이템을 프로필에 적용했습니다.");
      await loadAll();
    },
    [inventory, loadAll]
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-zinc-500 transition hover:text-white">
            ← 메인
          </Link>
          <Link href="/profile" className="text-sm text-zinc-400 transition hover:text-white">
            프로필
          </Link>
          <Link href="/inventory" className="text-sm text-zinc-400 transition hover:text-white">
            인벤토리
          </Link>
        </div>

        <header className="mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-fuchsia-300/90">
            Shop
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">VIBE 상점</h1>
          <p className="mt-2 text-sm text-zinc-500">
            보유한 VIBE로 아이템을 구매하고, 인벤토리에서 프로필 적용 상태를 관리하세요.
          </p>
          <p className="mt-4 text-sm text-zinc-300">
            보유 VIBE:{" "}
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

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">상품 목록</h2>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">등록된 상품이 없습니다.</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const owned = ownedItemIds.has(item.id);
                const cannotAfford = loggedIn && totalVibes < item.price;
                const disabled = !loggedIn || owned || cannotAfford || buyingId === item.id;
                return (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4"
                  >
                    <p className="text-xs text-zinc-500">{item.category ?? "기타"}</p>
                    <p className="mt-1 text-lg font-semibold text-white">{item.name}</p>
                    <p className="mt-2 line-clamp-3 text-sm text-zinc-400">
                      {item.description?.trim() || "설명 없음"}
                    </p>
                    <p className="mt-4 text-base font-semibold tabular-nums text-fuchsia-200">
                      {item.price.toLocaleString("ko-KR")} VIBE
                    </p>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void onBuy(item.id)}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/15 text-sm font-medium text-zinc-200 transition hover:border-fuchsia-400/45 hover:text-white disabled:opacity-50"
                    >
                      {!loggedIn
                        ? "로그인 필요"
                        : owned
                          ? "보유 중"
                          : cannotAfford
                            ? "VIBE 부족"
                            : buyingId === item.id
                              ? "구매 중…"
                              : "구매"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            내 인벤토리
          </h2>
          {!loggedIn ? (
            <p className="mt-4 text-sm text-zinc-500">로그인 후 인벤토리를 확인할 수 있어요.</p>
          ) : loading ? (
            <p className="mt-4 text-sm text-zinc-500">불러오는 중…</p>
          ) : inventory.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">아직 구매한 아이템이 없습니다.</p>
          ) : (
            <ul className="mt-4 space-y-3">
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
                        구매일{" "}
                        {new Date(row.purchased_at).toLocaleString("ko-KR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={active || activatingId === row.id}
                      onClick={() => void onActivate(row)}
                      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                        active
                          ? "border border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                          : "border border-white/15 text-zinc-200 hover:border-fuchsia-400/45 hover:text-white"
                      } disabled:opacity-60`}
                    >
                      {active ? "적용 중" : activatingId === row.id ? "적용 중…" : "프로필 적용"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-600">
            적용 로직: 같은 카테고리에서는 마지막으로 적용한 아이템 1개만 `is_active=true`가 되도록
            처리합니다.
          </p>
        </section>
      </div>
    </div>
  );
}
