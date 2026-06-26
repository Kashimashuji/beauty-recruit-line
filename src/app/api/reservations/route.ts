import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";

// GET: 指定店舗の空き予約枠一覧（学生のカレンダーUI用）
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("store_id");
  const eventType = req.nextUrl.searchParams.get("event_type") ?? "salon_visit";
  if (!storeId) {
    return NextResponse.json({ error: "store_id required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("reservation_slots")
    .select("id, starts_at, capacity, booked_count, event_type")
    .eq("store_id", storeId)
    .eq("event_type", eventType)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 残席を計算して返す
  const slots = (data ?? []).map((s) => ({
    ...s,
    remaining: s.capacity - s.booked_count,
  }));
  return NextResponse.json({ slots });
}

// POST: 予約を作成（DB関数book_slotで定員・二重予約を排他制御）
export async function POST(req: NextRequest) {
  const { line_user_id, slot_id } = await req.json();
  if (!line_user_id || !slot_id) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // 学生IDを解決
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("line_user_id", line_user_id)
    .single();

  if (!student) {
    return NextResponse.json({ error: "student not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.rpc("book_slot", {
    p_student: student.id,
    p_slot: slot_id,
  });

  if (error) {
    const msg = error.message.includes("SLOT_FULL")
      ? "満席です。別の枠をお選びください。"
      : error.message.includes("duplicate")
      ? "すでに予約済みです。"
      : "予約に失敗しました。";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // 予約確定の即時プッシュ（要件：登録直後リマインド）
  const { data: slot } = await supabaseAdmin
    .from("reservation_slots")
    .select("starts_at, stores(name, salons(name))")
    .eq("id", slot_id)
    .single();

  if (slot) {
    const dt = new Date(slot.starts_at).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    await pushText(
      line_user_id,
      `ご予約を承りました。\n日時：${dt}\n当日お会いできるのを楽しみにしています！`
    );
  }

  return NextResponse.json({ ok: true, reservation: data });
}
