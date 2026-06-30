import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { searchSchools, isExactSchool } from "@/lib/schools";
import { normalizeText } from "@/lib/normalize";
import { DEFAULT_BOT_MESSAGES, getMsg, type BotMessages } from "@/lib/botMessages";
import { askGemini, classifyIntent } from "@/lib/gemini";

export const runtime = "nodejs";

// デモ用Webhook: LINE署名検証なし、返信テキストをレスポンスで返す
export async function POST(req: NextRequest) {
  const { events } = await req.json();
  const replies: string[] = [];
  const quickReplies: string[] = [];
  const push = async (_to: string, text: string, buttons?: string[]) => {
    replies.push(text);
    if (buttons) quickReplies.push(...buttons);
  };

  // デモ用：最初の会社のBot設定を取得（なければデフォルト）
  const { data: companyData } = await supabaseAdmin.from("companies").select("id, settings").limit(1).single();
  const botMsg: Partial<BotMessages> = companyData?.settings ?? {};

  for (const ev of events ?? []) {
    const lineUserId: string | undefined = ev.source?.userId;
    if (!lineUserId) continue;

    if (ev.type === "follow") {
      await supabaseAdmin.from("students").upsert(
        { line_user_id: lineUserId, display_name: "デモユーザー", status: "friend" },
        { onConflict: "line_user_id", ignoreDuplicates: true }
      );
      await push(lineUserId, getMsg(botMsg, "welcome"));
    } else if (ev.type === "message" && ev.message?.type === "text") {
      await handleMessage(lineUserId, normalizeText(ev.message.text), push, botMsg);
    }
  }

  return NextResponse.json({ ok: true, replies, quickReplies });
}

async function handleMessage(
  lineUserId: string,
  text: string,
  push: (to: string, text: string, buttons?: string[]) => Promise<void>,
  botMsg: Partial<BotMessages> = {}
) {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, school_name, grad_year, pref_area, status, tags")
    .eq("line_user_id", lineUserId)
    .single();

  if (!student) {
    await push(lineUserId, "セッションが見つかりません。ページを再読み込みしてください。");
    return;
  }

  if (student.tags?.manual_mode) return;

  if (student.status === "friend") {
    await handleOnboarding(lineUserId, text, student, push, botMsg);
    return;
  }

  await handleBookingFlow(lineUserId, text, student, push, botMsg);
}

function staffSystemPrompt(student: any, extra = ""): string {
  return `あなたは美容サロンの採用サポートAIです。美容学生（専門学校生）の新卒採用をサポートするためにLINEで対応しています。

【役割と前提】
- 人材紹介会社ではなく、サロンが直接新卒採用を行っています
- 相手は美容専門学校に通う学生で、就職活動中または就職に興味を持ち始めた段階です
- 学生が安心して見学・説明会に参加できるよう、親しみやすく丁寧に対応してください

【回答スタイル】
- 3文以内で簡潔に。長文は避けてください
- 絵文字は文中に1個まで。文末に絵文字を置かないでください
- 「？」「！」を連続して使わないでください（例：「？？」「！！」は不可）
- 堅すぎず、馴れ馴れしすぎないトーンで
- 美容業界の専門用語はなるべく平易な言葉で補足してください

【重要なルール】
- サロン名・会社名・店舗名は絶対に自分で作らないでください。知らない場合は言及しないでください
- 「AIですか？」「ロボットですか？」など正体を聞かれた場合は、正直に「採用サポートAIです」と答えてください。人間のふりをしてはいけません
- 給与・待遇・勤務条件などの具体的な数字は「見学・説明会でご確認ください」と案内してください
- 予約・登録の操作は案内するだけで、実際の処理はしないでください
- 知らないことは知らないと言い、勝手に情報を作らないでください
${extra}
学生情報: 学校=${student.school_name ?? "未登録"}, 卒業予定=${student.grad_year ?? "未登録"}年, 希望エリア=${student.pref_area ?? "未登録"}`;
}

async function handleOnboarding(
  lineUserId: string,
  text: string,
  student: any,
  push: (to: string, text: string, buttons?: string[]) => Promise<void>,
  botMsg: Partial<BotMessages> = {}
) {
  if (!student.school_name) {
    // 候補から確定ボタンが押された場合
    const confirmMatch = text.match(/^「(.+)」で登録$/);
    const confirmed = confirmMatch ? confirmMatch[1] : (isExactSchool(text) ? text : null);
    if (confirmed) {
      await supabaseAdmin.from("students")
        .update({ school_name: confirmed, tags: { ...student.tags, school_candidates: null } })
        .eq("line_user_id", lineUserId);
      await push(lineUserId, `「${confirmed}」で登録しました！\n次に、卒業予定年度を教えてください。\n（例: 2027）`);
      return;
    }

    // Geminiで意図分類
    const intent = await classifyIntent(text, "school_name");

    if (intent === "question") {
      const isGreeting = /こんにちは|はじめまして|よろしく|おはよう|こんばん|はろ|ハロ|hello|hi/.test(text);
      const fallback = isGreeting ? "こんにちは！よろしくお願いします😊" : "ご質問ありがとうございます！";
      const aiReply = await askGemini(staffSystemPrompt(student), text);
      await push(lineUserId, (aiReply || fallback) + "\n\nまず、通っている専門学校名を教えてください。\n（最初の2〜3文字で検索できます）");
      return;
    }
    if (intent === "cancel") {
      await push(lineUserId, "わかりました！いつでもメッセージをお送りください😊\n\n専門学校名から登録できます。");
      return;
    }

    // input or correction → 学校名検索として処理
    const hits = searchSchools(text);
    if (hits.length > 0) {
      await supabaseAdmin.from("students")
        .update({ tags: { ...student.tags, school_candidates: hits } })
        .eq("line_user_id", lineUserId);
      await push(
        lineUserId,
        "以下の候補から選んでください。\n一覧にない場合は「そのまま登録」を押してください。",
        [...hits, `「${text}」で登録`]
      );
    } else {
      // 学校名っぽくない入力はAIで自然に返す
      const aiReply = await askGemini(staffSystemPrompt(student), text);
      if (aiReply) {
        await push(lineUserId, aiReply + "\n\n通っている専門学校名を教えてください。\n（最初の2〜3文字で検索できます）");
      } else {
        await push(
          lineUserId,
          `「${text}」に一致する学校が見つかりませんでした。\n別のキーワードで再入力するか、そのまま登録できます。`,
          [`「${text}」で登録`]
        );
      }
    }
    return;
  }

  if (!student.grad_year) {
    // 数字ならそのまま処理
    const year = parseInt(text, 10);
    if (!isNaN(year) && year >= 2020 && year <= 2035) {
      await supabaseAdmin.from("students").update({ grad_year: year }).eq("line_user_id", lineUserId);
      await push(lineUserId, "ありがとうございます！\n最後に、希望の勤務エリアを教えてください。\n（例: 東京都内、大阪など）");
      return;
    }

    // Geminiで意図分類
    const intent = await classifyIntent(text, "grad_year");

    if (intent === "correction") {
      await supabaseAdmin.from("students")
        .update({ school_name: null, tags: { ...student.tags, school_candidates: null } })
        .eq("line_user_id", lineUserId);
      await push(lineUserId, "学校名の入力に戻ります。\n通っている専門学校名を入力してください。");
      return;
    }
    if (intent === "question") {
      const aiReply = await askGemini(staffSystemPrompt(student), text);
      await push(lineUserId, (aiReply || "ご質問ありがとうございます！") + "\n\n卒業予定年度を数字で入力してください。\n（例: 2027）");
      return;
    }
    if (intent === "cancel") {
      await push(lineUserId, "わかりました！\n続きは「2027」のように卒業予定年度を送ってください。");
      return;
    }
    await push(lineUserId, "年度を数字で入力してください。\n（例: 2027）\n\n学校名を修正したい場合は「修正したい」と入力してください。");
    return;
  }

  if (!student.pref_area) {
    // Geminiで意図分類
    const intent = await classifyIntent(text, "pref_area");

    if (intent === "correction") {
      await supabaseAdmin.from("students")
        .update({ school_name: null, grad_year: null, tags: { ...student.tags, school_candidates: null } })
        .eq("line_user_id", lineUserId);
      await push(lineUserId, "学校名の入力に戻ります。\n通っている専門学校名を入力してください。");
      return;
    }
    if (intent === "question") {
      const aiReply = await askGemini(staffSystemPrompt(student), text);
      await push(lineUserId, (aiReply || "ご質問ありがとうございます！") + "\n\n希望の勤務エリアを教えてください。\n（例: 東京都内、大阪など）");
      return;
    }
    if (intent === "cancel") {
      await push(lineUserId, "わかりました！\n希望エリアを入力して登録を完了させましょう。\n（例: 東京都内、大阪など）");
      return;
    }

    // エリアっぽい入力か確認（都道府県・地名キーワード or 短い自由入力）
    const looksLikeArea = /都|道|府|県|市|区|町|村|東京|大阪|名古屋|横浜|神奈川|埼玉|千葉|京都|兵庫|福岡|札幌|仙台|広島|関東|関西|九州|全国|どこでも|anywhere/.test(text) || (text.length >= 2 && text.length <= 15);
    if (!looksLikeArea) {
      const aiReply = await askGemini(staffSystemPrompt(student), text);
      await push(lineUserId, (aiReply || "ご返答ありがとうございます！") + "\n\n希望の勤務エリアを教えてください。\n（例: 東京都内、大阪など）");
      return;
    }

    await supabaseAdmin.from("students").update({
      pref_area: text, status: "registered",
      registered_at: new Date().toISOString(),
    }).eq("line_user_id", lineUserId);
    await push(lineUserId, getMsg(botMsg, "registered"), ["予約する"]);
    return;
  }
}

async function handleBookingFlow(
  lineUserId: string,
  text: string,
  student: any,
  push: (to: string, text: string, buttons?: string[]) => Promise<void>,
  botMsg: Partial<BotMessages> = {}
) {
  const tags: any = student.tags ?? {};

  // 予約開始キーワード（ボタン含む）
  if (["予約", "よやく", "予約したい", "予約する", "別の枠も予約する"].includes(text)) {
    const { data: slots } = await supabaseAdmin
      .from("reservation_slots")
      .select("id, starts_at, capacity, booked_count, event_type, stores(name, address)")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(20);

    const available = (slots ?? []).filter((s: any) => s.booked_count < s.capacity);
    if (available.length === 0) {
      await push(lineUserId, "現在予約可能な枠がありません。\nまた後ほどお確かめください。");
      return;
    }

    // 希望エリアで絞り込み
    const prefArea: string = student.pref_area ?? "";
    const areaKeywords = prefArea.replace(/[都道府県市区町村内]+$/, "").split(/[・、\s]+/).filter(Boolean);

    const matchesArea = (s: any) => {
      if (!prefArea || areaKeywords.length === 0) return true;
      const addr: string = s.stores?.address ?? "";
      return areaKeywords.some(kw => addr.includes(kw));
    };

    const areaMatched = available.filter(matchesArea);
    const showSlots = areaMatched.length > 0 ? areaMatched : available;
    const isFiltered = areaMatched.length > 0 && areaMatched.length < available.length;
    const displaySlots = showSlots.slice(0, 10);

    const eventLabel: Record<string, string> = { salon_visit: "サロン見学", briefing: "説明会", consultation: "個別相談" };
    const slotLabels = displaySlots.map((s: any) => {
      const dt = new Date(s.starts_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
      const store = (s.stores?.name ?? "").replace(/^AGU hair\s*/i, "");
      const ev = { salon_visit: "見学", briefing: "説明会", consultation: "相談" }[s.event_type as string] ?? s.event_type;
      return `${dt} ${store}｜${ev} 残${s.capacity - s.booked_count}`;
    });
    const lines = displaySlots.map((s: any) => {
      const dt = new Date(s.starts_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
      return `${dt}\n   ${s.stores?.name ?? ""}｜${eventLabel[s.event_type] ?? s.event_type}｜残${s.capacity - s.booked_count}名`;
    });

    const header = isFiltered
      ? `📍 ${prefArea}エリアの予約可能な枠です。\n\nボタンを押して選んでください。`
      : `予約可能な枠は以下の通りです。\n\nボタンを押して選んでください。`;

    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: displaySlots.map((s: any) => s.id), slot_labels: slotLabels } })
      .eq("line_user_id", lineUserId);

    await push(lineUserId, `${header}\n\n${lines.join("\n\n")}`, slotLabels);
    return;
  }

  // 枠ボタン選択 or 番号入力
  const pendingSlots: string[] = tags.pending_slots ?? [];
  const slotLabels: string[] = tags.slot_labels ?? [];
  const labelIndex = slotLabels.indexOf(text);
  const numMatch = text.match(/^(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : NaN;
  const slotIndex = labelIndex >= 0 ? labelIndex : (!isNaN(num) && num >= 1 && num <= pendingSlots.length ? num - 1 : -1);

  if (slotIndex >= 0) {
    const slotId = pendingSlots[slotIndex];
    const { error } = await supabaseAdmin.rpc("book_slot", { p_student: student.id, p_slot: slotId });
    await supabaseAdmin.from("students")
      .update({ tags: { ...tags, pending_slots: [], slot_labels: [] } })
      .eq("line_user_id", lineUserId);

    if (error) {
      await push(lineUserId, error.message.includes("SLOT_FULL")
        ? "申し訳ありません、その枠は満席になりました。\n「予約」と送ってほかの枠をご確認ください。"
        : "予約処理に失敗しました。もう一度お試しください。");
      return;
    }

    const { data: slot } = await supabaseAdmin
      .from("reservation_slots").select("starts_at, stores(name)").eq("id", slotId).single();
    if (slot) {
      const dt = new Date(slot.starts_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
      const confirmedMsg = getMsg(botMsg, "booking_confirmed").replace("{date}", dt).replace("{store}", (slot.stores as any)?.name ?? "");
      await push(lineUserId, confirmedMsg, ["別の枠も予約する"]);
    }
    return;
  }

  // 枠選択待ち中の不明な入力 → Geminiで意図分類
  if (pendingSlots.length > 0 && slotLabels.length > 0) {
    const intent = await classifyIntent(text, "booking");
    if (intent === "cancel") {
      await supabaseAdmin.from("students")
        .update({ tags: { ...tags, pending_slots: [], slot_labels: [] } })
        .eq("line_user_id", lineUserId);
      await push(lineUserId, "わかりました！\n予約が必要になった際はいつでもご連絡ください。", ["予約する"]);
    } else if (intent === "question") {
      const aiReply = await askGemini(
        staffSystemPrompt(student, "\n予約は「予約する」ボタンから案内してください。"),
        text
      );
      await push(lineUserId, aiReply || "ご質問はスタッフにお問い合わせください。", slotLabels);
    } else {
      await push(lineUserId, "ボタンから枠を選んでください。", slotLabels);
    }
    return;
  }

  // 登録済み後の自由入力 → Geminiで意図分類
  const intent = await classifyIntent(text, "booking");

  if (intent === "correction") {
    await supabaseAdmin.from("students")
      .update({ school_name: null, grad_year: null, pref_area: null, status: "friend", tags: { ...tags, school_candidates: null } })
      .eq("line_user_id", lineUserId);
    await push(lineUserId, "登録情報をリセットしました。最初からやり直します。\n\n通っている専門学校名を教えてください。\n（最初の2〜3文字を入力するだけで候補が表示されます）");
    return;
  }
  if (intent === "cancel") {
    await push(lineUserId, "わかりました！\n予約が必要になった際はいつでもご連絡ください。", ["予約する"]);
    return;
  }

  // question or other → Geminiで回答
  const aiReply = await askGemini(
    staffSystemPrompt(student, "\n予約は「予約する」ボタンから案内してください。"),
    text
  );
  await push(lineUserId, aiReply || "見学・説明会の予約はボタンを押してください。", ["予約する"]);
}
