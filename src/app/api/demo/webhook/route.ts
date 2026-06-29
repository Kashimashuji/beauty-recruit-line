import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/line";
import { supabaseAdmin } from "@/lib/supabase";
import { searchSchools, isExactSchool } from "@/lib/schools";
import { normalizeText } from "@/lib/normalize";

export const runtime = "nodejs";

// デモ用Webhook: LINE署名検証なし、返信テキストをレスポンスで返す
export async function POST(req: NextRequest) {
  const { events } = await req.json();
  const replies: string[] = [];

  const quickReplies: string[] = [];
  const push = async (to: string, text: string, buttons?: string[]) => {
    replies.push(text);
    if (buttons) quickReplies.push(...buttons);
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
      await handleMessage(lineUserId, normalizeText(ev.message.text), push);
    }
  }

  return NextResponse.json({ ok: true, replies, quickReplies });
}

async function handleMessage(lineUserId: string, text: string, push: (to: string, text: string, buttons?: string[]) => Promise<void>) {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, school_name, grad_year, pref_area, status, tags")
    .eq("line_user_id", lineUserId)
    .single();

  if (!student) {
    await push(lineUserId, "セッションが見つかりません。ページを再読み込みしてください。");
    return;
  }

  // 手動対応モード中はBotが返信しない
  if (student.tags?.manual_mode) return;

  if (student.status === "friend") {
    await handleOnboarding(lineUserId, text, student, push);
    return;
  }

  await handleBookingFlow(lineUserId, text, student, push);
}

async function handleOnboarding(lineUserId: string, text: string, student: any, push: (to: string, text: string, buttons?: string[]) => Promise<void>) {
  if (!student.school_name) {
    const pending: string[] = student.tags?.school_candidates ?? [];

    // 候補から確定ボタンを押した場合（完全一致 or 「○○で登録」形式）
    const confirmMatch = text.match(/^「(.+)」で登録$/);
    const confirmed = confirmMatch ? confirmMatch[1] : (isExactSchool(text) ? text : null);

    if (confirmed) {
      await supabaseAdmin.from("students")
        .update({ school_name: confirmed, tags: { ...student.tags, school_candidates: null } })
        .eq("line_user_id", lineUserId);
      await push(lineUserId, `「${confirmed}」で登録しました！\n次に、卒業予定年度を教えてください。\n（例: 2027）`);
      return;
    }

    const hits = searchSchools(text);
    if (hits.length > 0) {
      await supabaseAdmin.from("students")
        .update({ tags: { ...student.tags, school_candidates: hits } })
        .eq("line_user_id", lineUserId);
      await push(
        lineUserId,
        "以下から学校名を選んでください。\n一覧にない場合は「そのまま登録する」を押してください。",
        [...hits, `「${text}」で登録`]
      );
    } else {
      await push(
        lineUserId,
        `「${text}」はリストにありませんでした。\nそのまま登録しますか？`,
        [`「${text}」で登録`]
      );
    }
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
    await push(lineUserId, "登録完了です！ありがとうございました🎉\n\n見学・説明会の予約をご希望の方はボタンを押してください。", ["予約する"]);
    return;
  }
}

async function handleBookingFlow(lineUserId: string, text: string, student: any, push: (to: string, text: string, buttons?: string[]) => Promise<void>) {
  const tags: any = student.tags ?? {};

  if (["予約", "よやく", "予約したい", "予約する", "別の枠も予約する"].includes(text)) {
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

    const slotLabels = available.map((s: any) => {
      const dt = new Date(s.starts_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
        weekday: "short", hour: "2-digit", minute: "2-digit",
      });
      const store = (s.stores?.name ?? "").replace(/^AGU hair\s*/i, "");
      const ev = { salon_visit: "見学", briefing: "説明会", consultation: "相談" }[s.event_type as string] ?? s.event_type;
      const remaining = s.capacity - s.booked_count;
      // LINE制限20文字以内のラベル
      return `${dt} ${store}｜${ev} 残${remaining}`;
    });

    const lines = available.map((s: any, i: number) => {
      const dt = new Date(s.starts_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
        weekday: "short", hour: "2-digit", minute: "2-digit",
      });
      const store = s.stores?.name ?? "";
      const remaining = s.capacity - s.booked_count;
      return `${dt}\n   ${store}｜${eventLabel[s.event_type] ?? s.event_type}｜残${remaining}名`;
    });

    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: available.map((s: any) => s.id), slot_labels: slotLabels } })
      .eq("line_user_id", lineUserId);

    await push(
      lineUserId,
      `予約可能な枠は以下の通りです。\n\nボタンを押して選んでください。`,
      slotLabels
    );
    return;
  }

  const pendingSlots: string[] = tags.pending_slots ?? [];
  const slotLabels: string[] = tags.slot_labels ?? [];
  // ボタンラベルで照合（数字入力にも後方互換で対応）
  const labelIndex = slotLabels.indexOf(text);
  const numMatch = text.match(/^(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : NaN;
  const slotIndex = labelIndex >= 0 ? labelIndex : (!isNaN(num) && num >= 1 && num <= pendingSlots.length ? num - 1 : -1);
  if (slotIndex >= 0) {
    const slotId = pendingSlots[slotIndex];
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
      await push(lineUserId, `ご予約ありがとうございます！\n\n📅 ${dt}\n📍 ${(slot.stores as any)?.name ?? ""}\n\n当日お会いできるのを楽しみにしています。`, ["別の枠も予約する"]);
    }
    return;
  }

  await push(lineUserId, "見学・説明会の予約はボタンを押してください。", ["予約する"]);
}
