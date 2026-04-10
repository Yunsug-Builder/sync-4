import { NextResponse } from "next/server";
import { createSupabaseAnonClient } from "@/lib/supabase";

/**
 * Supabase 연결 점검용 엔드포인트.
 * 브라우저에서 /api/debug-supabase 로 접속해 결과를 확인합니다.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, connected: false, error: "This endpoint is disabled in production." },
      { status: 403 }
    );
  }

  try {
    const supabase = createSupabaseAnonClient();

    const { error, count } = await supabase
      .from("spots")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          connected: false,
          message: "Supabase query failed.",
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      message: "Supabase connection succeeded.",
      table: "spots",
      rowCount: count ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        connected: false,
        message: "Supabase connection test crashed.",
        error: { message },
      },
      { status: 500 }
    );
  }
}
