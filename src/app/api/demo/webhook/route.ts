import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/line";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// デモ用Webhook: LINE署名検証なし、返信テキストをレスポンスで返す
export async function POST(req: NextRequest) {
  const { events } = await req.json();
  const replies: string[] = [];

  const push = async (to: string, text: string) => {
    replies.push(text);
  };

  for (const ev of events ?? []) {
    const lineUserId: string | undefined = ev.source?.userId;
    if (!lineUserId) continue;

    if (ev.type === "follow") {
      await supabaseAdmin.from("students").upsert(
        { line_user_id: lineUserId, display_name: "デモユーザー", status: "friend" },
        { onConflict: "line_user_id", ignoreDuplicates: true }
      );
      await push(lineUserId, "デモユーザーさん、友だち追加ありがとうございます！\n美容業界への就職に向けてサポートします。\n\nまず、通っている専門学校名を教えてください。");
    } else if (ev.type === "message" && ev.message?.type === "text") {
      await handleMessage(lineUserId, ev.message.text.trim(), push);
    }
  }

  return NextResponse.json({ ok: true, replies });
}

async function handleMessage(lineUserId: string, text: string, push: (to: string, text: string) => Promise<void>) {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, school_name, grad_year, pref_area, status, tags")
    .eq("line_user_id", lineUserId)
    .single();

  if (!student) {
    await push(lineUserId, "セッションが見つかりません。ページを再読み込みしてください。");
    return;
  }

  if (student.status === "friend") {
    await handleOnboarding(lineUserId, text, student, push);
    return;
  }

  await handleBookingFlow(lineUserId, text, student, push);
}

async function handleOnboarding(lineUserId: string, text: string, student: any, push: (to: string, text: string) => Promise<void>) {
  if (!student.school_name) {
    await supabaseAdmin.from("students").update({ school_name: text }).eq("line_user_id", lineUserId);
    await push(lineUserId, "ありがとうございます！\n次に、卒業予定年度を教えてください。\n（例: 2027）");
    return;
  }
  if (!student.grad_year) {
    const year = parseInt(text, 10);
    if (isNaN(year) || year < 2020 || year > 2035) {
      await push(lineUserId, "年度を数字で入力してください。\n（例: 2027）");
      return;
    }
    await supabaseAdmin.from("students").update({ grad_year: year }).eq("line_user_id", lineUserId);
    await push(lineUserId, "ありがとうございます！\n最後に、希望の勤務エリアを教えてください。\n（例: 東京都内、大阪など）");
    return;
  }
  if (!student.pref_area) {
    await supabaseAdmin.from("students").update({
      pref_area: text, status: "registered",
      registered_at: new Date().toISOString(),
    }).eq("line_user_id", lineUserId);
    await push(lineUserId, "登録完了です！ありがとうございました🎉\n\n見学・説明会の予約をご希望の方は「予約」と送ってください。");
    return;
  }
}

async function handleBookingFlow(lineUserId: string, text: string, student: any, push: (to: string, text: string) => Promise<void>) {
  const tags: any = student.tags ?? {};

  if (text === "予約" || text === "よやく" || text === "予約したい") {
    const { data: slots } = await supabaseAdmin
      .from("reservation_slots")
      .select("id, starts_at, capacity, booked_count, event_type, stores(name)")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(10);

    const available = (slots ?? []).filter((s: any) => s.booked_count < s.capacity);
    if (available.length === 0) {
      await push(lineUserId, "現在予約可能な枠がありません。\nまた後ほどお確かめください。");
      return;
    }

    const eventLabel: Record<string, string> = {
      salon_visit: "サロン見学", briefing: "説明会", consultation: "個別相談",
    };

    const lines = available.map((s: any, i: number) => {
      const dt = new Date(s.starts_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
        weekday: "short", hour: "2-digit", minute: "2-digit",
      });
      const store = s.stores?.name ?? "";
      const remaining = s.capacity - s.booked_count;
      return `${i + 1}. ${dt}\n   ${store}｜${eventLabel[s.event_type] ?? s.event_type}｜残${remaining}名`;
    });

    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: available.map((s: any) => s.id) } })
      .eq("line_user_id", lineUserId);

    await push(lineUserId, `予約可能な枠は以下の通りです。\n番号を送ってください。\n\n${lines.join("\n\n")}`);
    return;
  }

  const num = parseInt(text, 10);
  const pendingSlots: string[] = tags.pending_slots ?? [];
  if (!isNaN(num) && num >= 1 && num <= pendingSlots.length) {
    const slotId = pendingSlots[num - 1];
    const { error } = await supabaseAdmin.rpc("book_slot", { p_student: student.id, p_slot: slotId });

    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: [] } })
      .eq("line_user_id", lineUserId);

    if (error) {
      await push(lineUserId, error.message.includes("SLOT_FULL")
        ? "申し訳ありません、その枠は満席になりました。\n「予約」と送ってほかの枠をご確認ください。"
        : "予約処理に失敗しました。もう一度お試しください。");
      return;
    }

    const { data: slot } = await supabaseAdmin
      .from("reservation_slots")
      .select("starts_at, stores(name)")
      .eq("id", slotId).single();

    if (slot) {
      const dt = new Date(slot.starts_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
        weekday: "short", hour: "2-digit", minute: "2-digit",
      });
      await push(lineUserId, `ご予約ありがとうございます！\n\n📅 ${dt}\n📍 ${(slot.stores as any)?.name ?? ""}\n\n当日お会いできるのを楽しみにしています。`);
    }
    return;
  }

  await push(lineUserId, "見学・説明会の予約は「予約」と送ってください。");
}
