import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, getProfile, pushText } from "@/lib/line";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifyLineSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const { events } = JSON.parse(raw);

  for (const ev of events ?? []) {
    const lineUserId: string | undefined = ev.source?.userId;
    if (!lineUserId) continue;

    // 友だち追加 → 顧客一覧に自動追加（要件4-1）
    if (ev.type === "follow") {
      const profile = await getProfile(lineUserId);
      // entry_source はQRごとのfollow時パラメータがあれば拾う（後述LIFFでも更新可）
      await supabaseAdmin.from("students").upsert(
        {
          line_user_id: lineUserId,
          display_name: profile.displayName,
          status: "friend",
        },
        { onConflict: "line_user_id" }
      );
      await pushText(
        lineUserId,
        "友だち追加ありがとうございます！\nまずは会員証の登録から始めましょう。メニューの「会員証」をタップしてください。"
      );
    }

    // ブロック解除や再追加時もstatusは壊さない（follow側でupsert済）
  }

  return NextResponse.json({ ok: true });
}
