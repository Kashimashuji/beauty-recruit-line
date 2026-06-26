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

// 予約枠の追加
export async function POST(req: NextRequest) {
  const { store_id, event_type, starts_at, capacity } = await req.json();
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
