import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";

// Vercel Cron 等から定期実行（例：毎日8:00 JST）。
// CRON_SECRET で外部からの不正実行を防ぐ。
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // 前日リマインド対象：開催24〜48h後、まだ前日通知未送信
  const { data: d1 } = await supabaseAdmin
    .from("reservations")
    .select("id, students(line_user_id), reservation_slots(starts_at, stores(name))")
    .eq("status", "booked")
    .eq("reminded_d1", false)
    .gte("reservation_slots.starts_at", in24h.toISOString())
    .lt("reservation_slots.starts_at", in48h.toISOString());

  // 当日リマインド対象：開催24h以内、まだ当日通知未送信
  const { data: d0 } = await supabaseAdmin
    .from("reservations")
    .select("id, students(line_user_id), reservation_slots(starts_at, stores(name))")
    .eq("status", "booked")
    .eq("reminded_d0", false)
    .gte("reservation_slots.starts_at", now.toISOString())
    .lt("reservation_slots.starts_at", in24h.toISOString());

  let sent = 0;

  for (const r of d1 ?? []) {
    const uid = (r as any).students?.line_user_id;
    if (!uid) continue;
    await pushText(uid, "【前日のご案内】明日のサロン見学をお待ちしております。お気をつけてお越しください。");
    await supabaseAdmin.from("reservations").update({ reminded_d1: true }).eq("id", r.id);
    sent++;
  }

  for (const r of d0 ?? []) {
    const uid = (r as any).students?.line_user_id;
    if (!uid) continue;
    await pushText(uid, "【本日のご案内】本日サロン見学の日です。お会いできるのを楽しみにしています！");
    await supabaseAdmin.from("reservations").update({ reminded_d0: true }).eq("id", r.id);
    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
