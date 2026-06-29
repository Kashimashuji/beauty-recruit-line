import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// 管理画面用：予約一覧（カレンダー/リスト表示のデータ源）
export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get("view") ?? "reservations";

  if (view === "stores") {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, salon_id")
      .order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ stores: data });
  }

  if (view === "slots") {
    const { data, error } = await supabaseAdmin
      .from("reservation_slots")
      .select("id, store_id, event_type, starts_at, capacity, booked_count, stores(name)")
      .order("starts_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ slots: data });
  }

  if (view === "students") {
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("id, full_name, school_name, grad_year, pref_area, entry_source, status, created_at")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ students: data });
  }

  const { data, error } = await supabaseAdmin
    .from("reservations")
    .select(
      "id, status, created_at, students(full_name, school_name), reservation_slots(starts_at, stores(name))"
    )
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reservations: data });
}

// 予約枠の追加 / 一括作成 / コピー
export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action ?? "single";

  // --- 一括作成 ---
  if (action === "bulk") {
    const { store_id, event_type, start_date, end_date, weekdays, time, capacity } = body;
    if (!store_id || !start_date || !end_date || !weekdays?.length || !time || !capacity) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    const rows: object[] = [];
    const cur = new Date(start_date + "T00:00:00+09:00");
    const end = new Date(end_date + "T00:00:00+09:00");
    const [hh, mm] = (time as string).split(":").map(Number);
    while (cur <= end) {
      if ((weekdays as number[]).includes(cur.getDay())) {
        const dt = new Date(cur);
        dt.setHours(hh, mm, 0, 0);
        rows.push({ store_id, event_type: event_type ?? "salon_visit", starts_at: dt.toISOString(), capacity: Number(capacity) });
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (rows.length === 0) return NextResponse.json({ error: "指定期間内に該当曜日がありません" }, { status: 400 });
    const { error } = await supabaseAdmin.from("reservation_slots").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: rows.length });
  }

  // --- コピー ---
  if (action === "copy") {
    const { slot_id, offset_days } = body;
    if (!slot_id || !offset_days) return NextResponse.json({ error: "missing fields" }, { status: 400 });
    const { data: src, error: fetchErr } = await supabaseAdmin
      .from("reservation_slots")
      .select("store_id, event_type, starts_at, capacity")
      .eq("id", slot_id)
      .single();
    if (fetchErr || !src) return NextResponse.json({ error: "元の枠が見つかりません" }, { status: 404 });
    const newDate = new Date(src.starts_at);
    newDate.setDate(newDate.getDate() + Number(offset_days));
    const { error } = await supabaseAdmin.from("reservation_slots").insert({
      store_id: src.store_id, event_type: src.event_type,
      starts_at: newDate.toISOString(), capacity: src.capacity,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // --- 単体追加 ---
  const { store_id, event_type, starts_at, capacity } = body;
  if (!store_id || !starts_at || !capacity) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("reservation_slots").insert({
    store_id,
    event_type: event_type ?? "salon_visit",
    starts_at,
    capacity: Number(capacity),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
