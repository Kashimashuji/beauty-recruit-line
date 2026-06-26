import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// LIFFの会員証フォームから送られてくる学生情報を保存
// （本番ではLIFFのIDトークンを検証してline_user_idを確定すること）
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    line_user_id,
    full_name,
    full_name_kana,
    school_name,
    grad_year,
    pref_area,
    entry_source,
  } = body;

  if (!line_user_id || !full_name || !school_name) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  // 既存行があれば更新、なければ挿入（LIFF外からの直接フォーム送信も許容）
  const { error: upsertError } = await supabaseAdmin.from("students").upsert(
    {
      line_user_id,
      full_name,
      full_name_kana,
      school_name,
      grad_year,
      pref_area,
      entry_source,
      registered_at: new Date().toISOString(),
    },
    { onConflict: "line_user_id" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // ステータスは friend/registered のときだけ registered へ前進（後退させない）
  await supabaseAdmin
    .from("students")
    .update({ status: "registered" })
    .eq("line_user_id", line_user_id)
    .in("status", ["friend", "registered"]);

  return NextResponse.json({ ok: true });
}
