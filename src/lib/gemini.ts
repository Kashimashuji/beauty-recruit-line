async function callGemini(body: object): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) return "";
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

export async function askGemini(systemPrompt: string, userMessage: string): Promise<string> {
  return callGemini({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
  });
}

export type Intent = "input" | "question" | "cancel" | "correction";

/**
 * ユーザーの発言をGeminiで意図分類する。
 * step: 現在のフロー ("school_name" | "grad_year" | "pref_area" | "booking")
 */
export async function classifyIntent(text: string, step: string): Promise<Intent> {
  const stepLabel: Record<string, string> = {
    school_name: "専門学校名を入力してもらうステップ",
    grad_year: "卒業予定年度（数字4桁）を入力してもらうステップ",
    pref_area: "希望勤務エリアを入力してもらうステップ",
    booking: "見学・説明会の予約枠を選んでもらうステップ",
  };
  const prompt = `あなたはLINEチャットボットの意図分類AIです。
現在のステップ: ${stepLabel[step] ?? step}
ユーザーの発言: 「${text}」

次の4つのうち、最も当てはまる1単語のみを出力してください。説明は不要です。
- input : このステップで期待される入力（学校名・年度・エリア・枠番号など）
- question : 質問・挨拶・雑談
- cancel : キャンセル・やめる・不要・断る
- correction : 前の入力を修正したい・やり直したい`;

  const raw = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 10, temperature: 0 },
  });

  const word = raw.toLowerCase().trim();
  if (word.startsWith("cancel")) return "cancel";
  if (word.startsWith("correction")) return "correction";
  if (word.startsWith("question")) return "question";
  return "input";
}
