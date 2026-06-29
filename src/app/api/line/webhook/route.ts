import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, getProfile, pushText } from "@/lib/line";
import { supabaseAdmin } from "@/lib/supabase";
import { searchSchools, isExactSchool } from "@/lib/schools";
import { normalizeText } from "@/lib/normalize";
import { askGemini, classifyIntent } from "@/lib/gemini";

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
      await handleMessage(lineUserId, normalizeText(ev.message.text));
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleFollow(lineUserId: string) {
  const profile = await getProfile(lineUserId);
  await supabaseAdmin.from("students").upsert(
    { line_user_id: lineUserId, display_name: profile.displayName, status: "friend" },
    { onConflict: "line_user_id", ignoreDuplicates: true }
  );
  await pushText(
    lineUserId,
    `${profile.displayName}さん、友だち追加ありがとうございます！\n採用担当よりご連絡させていただきます。\n\nまず、通っている専門学校名を教えてください。\n（最初の2〜3文字を入力するだけで候補が表示されます）`
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

  if (student.tags?.manual_mode) return;

  if (student.status === "friend") {
    await handleOnboarding(lineUserId, text, student);
    return;
  }

  await handleBookingFlow(lineUserId, text, student);
}

function staffSystemPrompt(student: any, extra = ""): string {
  return `あなたは美容サロンの採用担当スタッフとしてLINEで学生に対応しています。
採用担当として自然で親切に、3文以内で回答してください。絵文字は1〜2個まで。
予約・登録の操作案内はしても実際の処理はしないでください。${extra}
学生情報: 学校=${student.school_name ?? "未登録"}, 卒業年度=${student.grad_year ?? "未登録"}, 希望エリア=${student.pref_area ?? "未登録"}`;
}

async function handleOnboarding(lineUserId: string, text: string, student: any) {
  if (!student.school_name) {
    // 完全一致で確定
    if (isExactSchool(text)) {
      await supabaseAdmin.from("students")
        .update({ school_name: text, tags: { ...(student.tags ?? {}), school_candidates: null } })
        .eq("line_user_id", lineUserId);
      await pushText(lineUserId, `「${text}」で登録しました！\n次に、卒業予定年度を教えてください。\n（例: 2027）`);
      return;
    }

    // 候補番号が送られた場合
    if (student.tags?.school_candidates !== undefined) {
      const candidates: string[] = student.tags.school_candidates ?? [];
      const num = parseInt(text, 10);
      if (!isNaN(num)) {
        let chosen: string | null = null;
        if (num === 0 && student.tags.school_query) chosen = student.tags.school_query;
        else if (num >= 1 && num <= candidates.length) chosen = candidates[num - 1];
        if (chosen) {
          await supabaseAdmin.from("students")
            .update({ school_name: chosen, tags: { ...student.tags, school_candidates: null, school_query: null } })
            .eq("line_user_id", lineUserId);
          await pushText(lineUserId, `「${chosen}」で登録しました！\n次に、卒業予定年度を教えてください。\n（例: 2027）`);
          return;
        }
      }
    }

    // Geminiで意図分類
    const intent = await classifyIntent(text, "school_name");

    if (intent === "question") {
      const aiReply = await askGemini(staffSystemPrompt(student), text);
      await pushText(lineUserId, (aiReply || "ご質問ありがとうございます！") + "\n\nまず、通っている専門学校名を教えてください。\n（最初の2〜3文字で検索できます）");
      return;
    }
    if (intent === "cancel") {
      await pushText(lineUserId, "わかりました！いつでもメッセージをお送りください😊\n\n専門学校名から登録できます。");
      return;
    }

    // input / correction → 学校名検索
    const hits = searchSchools(text);
    if (hits.length > 0) {
      await supabaseAdmin.from("students")
        .update({ tags: { ...(student.tags ?? {}), school_candidates: hits, school_query: text } })
        .eq("line_user_id", lineUserId);
      await pushText(lineUserId, `以下から学校名を選んでください。\n\n${hits.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n番号を送ってください。\n一覧にない場合は「0」を送ると入力した名前でそのまま登録します。`);
    } else {
      await supabaseAdmin.from("students")
        .update({ tags: { ...(student.tags ?? {}), school_candidates: [], school_query: text } })
        .eq("line_user_id", lineUserId);
      await pushText(lineUserId, `「${text}」に一致する学校が見つかりませんでした。\n別のキーワードで再入力するか、「0」を送るとそのまま登録できます。`);
    }
    return;
  }

  if (!student.grad_year) {
    const year = parseInt(text, 10);
    if (!isNaN(year) && year >= 2020 && year <= 2035) {
      await supabaseAdmin.from("students").update({ grad_year: year }).eq("line_user_id", lineUserId);
      await pushText(lineUserId, "ありがとうございます！\n最後に、希望の勤務エリアを教えてください。\n（例: 東京都内、大阪など）");
      return;
    }

    const intent = await classifyIntent(text, "grad_year");
    if (intent === "correction") {
      await supabaseAdmin.from("students")
        .update({ school_name: null, tags: { ...(student.tags ?? {}), school_candidates: null } })
        .eq("line_user_id", lineUserId);
      await pushText(lineUserId, "学校名の入力に戻ります。\n通っている専門学校名を入力してください。");
      return;
    }
    if (intent === "question") {
      const aiReply = await askGemini(staffSystemPrompt(student), text);
      await pushText(lineUserId, (aiReply || "ご質問ありがとうございます！") + "\n\n卒業予定年度を数字で入力してください。\n（例: 2027）");
      return;
    }
    if (intent === "cancel") {
      await pushText(lineUserId, "わかりました！\n続きは「2027」のように卒業予定年度を送ってください。");
      return;
    }
    await pushText(lineUserId, "年度を数字で入力してください。\n（例: 2027）\n\n学校名を修正したい場合は「修正したい」と入力してください。");
    return;
  }

  if (!student.pref_area) {
    const intent = await classifyIntent(text, "pref_area");
    if (intent === "correction") {
      await supabaseAdmin.from("students")
        .update({ school_name: null, grad_year: null, tags: { ...(student.tags ?? {}), school_candidates: null } })
        .eq("line_user_id", lineUserId);
      await pushText(lineUserId, "学校名の入力に戻ります。\n通っている専門学校名を入力してください。");
      return;
    }
    if (intent === "question") {
      const aiReply = await askGemini(staffSystemPrompt(student), text);
      await pushText(lineUserId, (aiReply || "ご質問ありがとうございます！") + "\n\n希望の勤務エリアを教えてください。\n（例: 東京都内、大阪など）");
      return;
    }
    if (intent === "cancel") {
      await pushText(lineUserId, "わかりました！\n希望エリアを入力して登録を完了させましょう。\n（例: 東京都内、大阪など）");
      return;
    }

    await supabaseAdmin.from("students").update({
      pref_area: text, status: "registered",
      registered_at: new Date().toISOString(),
    }).eq("line_user_id", lineUserId);
    await pushText(lineUserId, "登録完了です！ありがとうございました🎉\n\n見学・説明会の予約をご希望の方は「予約」と送ってください。");
    return;
  }
}

async function handleBookingFlow(lineUserId: string, text: string, student: any) {
  const tags: any = student.tags ?? {};

  if (["予約", "よやく", "予約したい"].includes(text)) {
    const { data: slots } = await supabaseAdmin
      .from("reservation_slots")
      .select("id, starts_at, capacity, booked_count, event_type, stores(name)")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(10);

    const available = (slots ?? []).filter((s: any) => s.booked_count < s.capacity);
    if (available.length === 0) {
      await pushText(lineUserId, "現在予約可能な枠がありません。\nまた後ほどお確かめください。");
      return;
    }

    const eventLabel: Record<string, string> = { salon_visit: "サロン見学", briefing: "説明会", consultation: "個別相談" };
    const lines = available.map((s: any, i: number) => {
      const dt = new Date(s.starts_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
      return `${i + 1}. ${dt}\n   ${s.stores?.name ?? ""}｜${eventLabel[s.event_type] ?? s.event_type}｜残${s.capacity - s.booked_count}名`;
    });

    const slotIds = available.map((s: any) => s.id);
    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: slotIds } })
      .eq("line_user_id", lineUserId);

    await pushText(lineUserId, `予約可能な枠は以下の通りです。\n番号を送ってください。\n\n${lines.join("\n\n")}`);
    return;
  }

  // 番号選択
  const num = parseInt(text, 10);
  const pendingSlots: string[] = tags.pending_slots ?? [];
  if (!isNaN(num) && num >= 1 && num <= pendingSlots.length) {
    const slotId = pendingSlots[num - 1];
    const { error } = await supabaseAdmin.rpc("book_slot", { p_student: student.id, p_slot: slotId });
    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: [] } })
      .eq("line_user_id", lineUserId);

    if (error) {
      await pushText(lineUserId, error.message.includes("SLOT_FULL")
        ? "申し訳ありません、その枠は満席になりました。\n「予約」と送ってほかの枠をご確認ください。"
        : "予約処理に失敗しました。もう一度お試しください。");
      return;
    }

    const { data: slot } = await supabaseAdmin
      .from("reservation_slots").select("starts_at, stores(name)").eq("id", slotId).single();
    if (slot) {
      const dt = new Date(slot.starts_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
      await pushText(lineUserId, `ご予約ありがとうございます！\n\n📅 ${dt}\n📍 ${(slot.stores as any)?.name ?? ""}\n\n当日お会いできるのを楽しみにしています。\nご不明な点はお気軽にご連絡ください。`);
    }
    return;
  }

  // 枠選択待ち中の不明な入力 → Geminiで意図分類
  if (pendingSlots.length > 0) {
    const intent = await classifyIntent(text, "booking");
    if (intent === "cancel") {
      await supabaseAdmin.from("students")
        .update({ tags: { ...tags, pending_slots: [] } })
        .eq("line_user_id", lineUserId);
      await pushText(lineUserId, "わかりました！\n予約が必要になった際はいつでもご連絡ください。");
    } else if (intent === "question") {
      const aiReply = await askGemini(staffSystemPrompt(student, "\n予約は番号を送るよう案内してください。"), text);
      await pushText(lineUserId, (aiReply || "ご質問はスタッフにお問い合わせください。") + "\n\n番号を送って枠を選んでください。");
    } else {
      await pushText(lineUserId, "番号を送って枠を選んでください。");
    }
    return;
  }

  // 登録済み後の自由入力 → Geminiで意図分類
  const intent = await classifyIntent(text, "booking");

  if (intent === "correction") {
    await supabaseAdmin.from("students")
      .update({ school_name: null, grad_year: null, pref_area: null, status: "friend", tags: { ...tags, school_candidates: null } })
      .eq("line_user_id", lineUserId);
    await pushText(lineUserId, "登録情報をリセットしました。最初からやり直します。\n\n通っている専門学校名を教えてください。\n（最初の2〜3文字を入力するだけで候補が表示されます）");
    return;
  }
  if (intent === "cancel") {
    await pushText(lineUserId, "わかりました！\n予約が必要になった際はいつでもご連絡ください。");
    return;
  }

  // question or other → Geminiで回答
  const aiReply = await askGemini(
    staffSystemPrompt(student, "\n予約は「予約」と送るよう案内してください。"),
    text
  );
  await pushText(lineUserId, aiReply || "見学・説明会の予約は「予約」と送ってください。");
}
