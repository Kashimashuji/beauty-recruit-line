import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, getProfile, pushText } from "@/lib/line";
import { supabaseAdmin } from "@/lib/supabase";

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
    .select("school_name, grad_year, pref_area, status")
    .eq("line_user_id", lineUserId)
    .single();

  if (!student) {
    await pushText(lineUserId, "はじめまして！まずは友だち追加からお願いします。");
    return;
  }

  // 登録完了済みの場合
  if (student.status !== "friend") {
    await pushText(lineUserId, "ご登録ありがとうございます！\nメニューから見学予約ができます。お気軽にどうぞ。");
    return;
  }

  // ステップ1: 学校名を収集
  if (!student.school_name) {
    await supabaseAdmin
      .from("students")
      .update({ school_name: text })
      .eq("line_user_id", lineUserId);
    await pushText(lineUserId, "ありがとうございます！\n次に、卒業予定年度を教えてください。\n（例: 2027）");
    return;
  }

  // ステップ2: 卒業年度を収集
  if (!student.grad_year) {
    const year = parseInt(text, 10);
    if (isNaN(year) || year < 2020 || year > 2035) {
      await pushText(lineUserId, "年度を数字で入力してください。\n（例: 2027）");
      return;
    }
    await supabaseAdmin
      .from("students")
      .update({ grad_year: year })
      .eq("line_user_id", lineUserId);
    await pushText(lineUserId, "ありがとうございます！\n最後に、希望の勤務エリアを教えてください。\n（例: 東京都内、大阪、名古屋など）");
    return;
  }

  // ステップ3: 希望エリアを収集 → 登録完了
  if (!student.pref_area) {
    await supabaseAdmin
      .from("students")
      .update({
        pref_area: text,
        status: "registered",
        registered_at: new Date().toISOString(),
      })
      .eq("line_user_id", lineUserId);
    await pushText(
      lineUserId,
      "登録完了です！ありがとうございました。\n\nメニューから見学・説明会の予約ができます。\nご都合の良い日程をお選びください。"
    );
    return;
  }
}
