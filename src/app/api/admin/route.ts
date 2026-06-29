import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { pushText } from "@/lib/line";

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
      .select("id, full_name, display_name, school_name, grad_year, pref_area, entry_source, status, tags, line_user_id, created_at, reservations(created_at)")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // 最新の予約日時を booked_at として付与
    const students = (data ?? []).map((s: any) => {
      const dates = (s.reservations ?? []).map((r: any) => r.created_at).sort();
      return { ...s, booked_at: dates[dates.length - 1] ?? null };
    });
    return NextResponse.json({ students });
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

  // --- 枠編集 ---
  if (action === "update_slot") {
    const { slot_id, store_id, event_type, starts_at, capacity } = body;
    if (!slot_id) return NextResponse.json({ error: "missing slot_id" }, { status: 400 });
    const { error } = await supabaseAdmin.from("reservation_slots")
      .update({ store_id, event_type, starts_at, capacity: Number(capacity) })
      .eq("id", slot_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // --- 枠削除（単体） ---
  if (action === "delete_slot") {
    const { slot_id } = body;
    if (!slot_id) return NextResponse.json({ error: "missing slot_id" }, { status: 400 });
    const { data: slot } = await supabaseAdmin.from("reservation_slots")
      .select("booked_count").eq("id", slot_id).single();
    if (slot && slot.booked_count > 0) {
      return NextResponse.json({ error: "予約済みの枠は削除できません" }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from("reservation_slots").delete().eq("id", slot_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // --- 枠一括削除 ---
  if (action === "bulk_delete_slots") {
    const { slot_ids } = body as { slot_ids: string[] };
    if (!slot_ids?.length) return NextResponse.json({ error: "missing slot_ids" }, { status: 400 });
    const { data: booked } = await supabaseAdmin.from("reservation_slots")
      .select("id").in("id", slot_ids).gt("booked_count", 0);
    if (booked && booked.length > 0) {
      return NextResponse.json({ error: `${booked.length}件は予約済みのため削除できません` }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from("reservation_slots").delete().in("id", slot_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: slot_ids.length });
  }

  // --- 手動モード切替 ---
  if (action === "toggle_manual") {
    const { student_id, manual_mode } = body;
    if (!student_id) return NextResponse.json({ error: "missing student_id" }, { status: 400 });
    const { data: student } = await supabaseAdmin.from("students").select("tags").eq("id", student_id).single();
    const { error } = await supabaseAdmin.from("students")
      .update({ tags: { ...(student?.tags ?? {}), manual_mode: !!manual_mode } })
      .eq("id", student_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // --- 手動メッセージ送信 ---
  if (action === "send_message") {
    const { student_id, message } = body;
    if (!student_id || !message) return NextResponse.json({ error: "missing fields" }, { status: 400 });
    const { data: student } = await supabaseAdmin.from("students")
      .select("line_user_id").eq("id", student_id).single();
    if (!student?.line_user_id) return NextResponse.json({ error: "学生が見つかりません" }, { status: 404 });
    const hasLine = process.env.LINE_CHANNEL_ACCESS_TOKEN && !process.env.LINE_CHANNEL_ACCESS_TOKEN.startsWith("replace-");
    if (hasLine) {
      try { await pushText(student.line_user_id, message); } catch (e) {
        return NextResponse.json({ error: "LINE送信に失敗しました" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, sent: !!hasLine });
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
