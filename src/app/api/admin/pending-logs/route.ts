import { NextResponse } from "next/server";
import {
  createSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase-service";

export type PendingLogRow = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  profiles: { nickname: string | null } | null;
  activity_types: { name: string; base_vibes: number } | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function normalizePendingRow(row: Record<string, unknown>): PendingLogRow {
  return {
    id: String(row.id),
    content: row.content != null ? String(row.content) : null,
    created_at: String(row.created_at),
    user_id: String(row.user_id),
    profiles: firstOrNull(row.profiles as { nickname: string | null } | null),
    activity_types: firstOrNull(
      row.activity_types as { name: string; base_vibes: number } | null
    ),
  };
}

export async function GET() {
  if (!hasSupabaseServiceRoleConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. 관리자 API는 서비스 롤 키가 필요합니다.",
      },
      { status: 503 }
    );
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("activity_logs")
    .select(
      `
      id,
      content,
      created_at,
      user_id,
      profiles ( nickname ),
      activity_types ( name, base_vibes )
    `
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/pending-logs]", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const logs = (data ?? []).map((row) =>
    normalizePendingRow(row as Record<string, unknown>)
  );

  return NextResponse.json({
    ok: true,
    logs,
  });
}
