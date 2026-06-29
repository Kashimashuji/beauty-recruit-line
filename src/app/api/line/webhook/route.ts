import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, getProfile, pushText } from "@/lib/line";
import { supabaseAdmin } from "@/lib/supabase";
import { searchSchools, isExactSchool } from "@/lib/schools";

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

    if (ev.type === "follow") {
      await handleFollow(lineUserId);
    } else if (ev.type === "message" && ev.message?.type === "text") {
      await handleMessage(lineUserId, ev.message.text.trim());
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleFollow(lineUserId: string) {
  const profile = await getProfile(lineUserId);
  await supabaseAdmin.from("students").upsert(
    {
      line_user_id: lineUserId,
      display_name: profile.displayName,
      status: "friend",
    },
    { onConflict: "line_user_id", ignoreDuplicates: true }
  );
  await pushText(
    lineUserId,
    `${profile.displayName}さん、友だち追加ありがとうございます！\n美容業界への就職に向けてサポートします。\n\nまず、通っている専門学校名を教えてください。`
  );
}

async function handleMessage(lineUserId: string, text: string) {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, school_name, grad_year, pref_area, status, tags")
    .eq("line_user_id", lineUserId)
    .single();

  if (!student) {
    await pushText(lineUserId, "はじめまして！まずは友だち追加からお願いします。");
    return;
  }

  // オンボーディング中（friendステータス）
  if (student.status === "friend") {
    await handleOnboarding(lineUserId, text, student);
    return;
  }

  // 登録済み以降：予約フロー
  await handleBookingFlow(lineUserId, text, student);
}

async function handleOnboarding(lineUserId: string, text: string, student: any) {
  // 学校候補から番号選択（0 = 自由入力で登録）
  if (!student.school_name && student.tags?.school_candidates !== undefined) {
    const candidates: string[] = student.tags.school_candidates ?? [];
    const num = parseInt(text, 10);
    if (!isNaN(num)) {
      let chosen: string | null = null;
      if (num === 0 && student.tags.school_query) {
        chosen = student.tags.school_query;
      } else if (num >= 1 && num <= candidates.length) {
        chosen = candidates[num - 1];
      }
      if (chosen) {
        await supabaseAdmin.from("students").update({
          school_name: chosen,
          tags: { ...student.tags, school_candidates: null, school_query: null },
        }).eq("line_user_id", lineUserId);
        await pushText(lineUserId, `「${chosen}」で登録しました！\n次に、卒業予定年度を教えてください。\n（例: 2027）`);
        return;
      }
    }
  }

  if (!student.school_name) {
    const confirmMatch = text.match(/^(\d+)$/) ? null : text;
    if (isExactSchool(text)) {
      await supabaseAdmin.from("students").update({ school_name: text, tags: { ...(student.tags ?? {}), school_candidates: null } }).eq("line_user_id", lineUserId);
      await pushText(lineUserId, `「${text}」で登録しました！\n次に、卒業予定年度を教えてください。\n（例: 2027）`);
      return;
    }
    const hits = searchSchools(text);
    if (hits.length > 0) {
      await supabaseAdmin.from("students").update({ tags: { ...(student.tags ?? {}), school_candidates: hits, school_query: text } }).eq("line_user_id", lineUserId);
      await pushText(lineUserId, `以下から学校名を選んでください。\n\n${hits.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n番号を送ってください。\n一覧にない場合は「0」を送ると入力した名前でそのまま登録します。`);
    } else {
      await supabaseAdmin.from("students").update({ tags: { ...(student.tags ?? {}), school_candidates: [], school_query: text } }).eq("line_user_id", lineUserId);
      await pushText(lineUserId, `「${text}」はリストにありませんでした。\nそのまま登録する場合は「0」を送ってください。\n別のキーワードで再入力することもできます。`);
    }
    return;
  }
  if (!student.grad_year) {
    const year = parseInt(text, 10);
    if (isNaN(year) || year < 2020 || year > 2035) {
      await pushText(lineUserId, "年度を数字で入力してください。\n（例: 2027）");
      return;
    }
    await supabaseAdmin.from("students").update({ grad_year: year }).eq("line_user_id", lineUserId);
    await pushText(lineUserId, "ありがとうございます！\n最後に、希望の勤務エリアを教えてください。\n（例: 東京都内、大阪など）");
    return;
  }
  if (!student.pref_area) {
    await supabaseAdmin.from("students").update({
      pref_area: text,
      status: "registered",
      registered_at: new Date().toISOString(),
    }).eq("line_user_id", lineUserId);
    await pushText(
      lineUserId,
      "登録完了です！ありがとうございました🎉\n\n見学・説明会の予約をご希望の方は「予約」と送ってください。"
    );
    return;
  }
}

async function handleBookingFlow(lineUserId: string, text: string, student: any) {
  const tags: any = student.tags ?? {};

  // 「予約」キーワード → 空き枠一覧を表示
  if (text === "予約" || text === "よやく" || text === "予約したい") {
    const { data: slots } = await supabaseAdmin
      .from("reservation_slots")
      .select("id, starts_at, capacity, booked_count, event_type, stores(name)")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(10);

    const available = (slots ?? []).filter(s => s.booked_count < s.capacity);
    if (available.length === 0) {
      await pushText(lineUserId, "現在予約可能な枠がありません。\nまた後ほどお確かめください。");
      return;
    }

    const eventLabel: Record<string, string> = {
      salon_visit: "サロン見学",
      briefing: "説明会",
      consultation: "個別相談",
    };

    const lines = available.map((s, i) => {
      const dt = new Date(s.starts_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
        weekday: "short", hour: "2-digit", minute: "2-digit",
      });
      const store = (s.stores as any)?.name ?? "";
      const remaining = s.capacity - s.booked_count;
      return `${i + 1}. ${dt}\n   ${store}｜${eventLabel[s.event_type] ?? s.event_type}｜残${remaining}名`;
    });

    // 選択中の枠IDリストをtagsに一時保存
    const slotIds = available.map(s => s.id);
    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: slotIds } })
      .eq("line_user_id", lineUserId);

    await pushText(
      lineUserId,
      `予約可能な枠は以下の通りです。\n番号を送ってください。\n\n${lines.join("\n\n")}`
    );
    return;
  }

  // 番号選択 → 予約実行
  const num = parseInt(text, 10);
  const pendingSlots: string[] = tags.pending_slots ?? [];
  if (!isNaN(num) && num >= 1 && num <= pendingSlots.length) {
    const slotId = pendingSlots[num - 1];

    const { data, error } = await supabaseAdmin.rpc("book_slot", {
      p_student: student.id,
      p_slot: slotId,
    });

    // pending_slotsをクリア
    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: [] } })
      .eq("line_user_id", lineUserId);

    if (error) {
      const msg = error.message.includes("SLOT_FULL")
        ? "申し訳ありません、その枠は満席になりました。\n「予約」と送ってほかの枠をご確認ください。"
        : "予約処理に失敗しました。もう一度お試しください。";
      await pushText(lineUserId, msg);
      return;
    }

    // 予約完了メッセージ
    const { data: slot } = await supabaseAdmin
      .from("reservation_slots")
      .select("starts_at, stores(name)")
      .eq("id", slotId)
      .single();

    if (slot) {
      const dt = new Date(slot.starts_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
        weekday: "short", hour: "2-digit", minute: "2-digit",
      });
      const store = (slot.stores as any)?.name ?? "";
      await pushText(
        lineUserId,
        `ご予約ありがとうございます！\n\n📅 ${dt}\n📍 ${store}\n\n当日お会いできるのを楽しみにしています。\nご不明な点はお気軽にご連絡ください。`
      );
    }
    return;
  }

  // その他のメッセージ
  await pushText(
    lineUserId,
    "見学・説明会の予約は「予約」と送ってください。\nそのほかのご質問はスタッフにお問い合わせください。"
  );
}
