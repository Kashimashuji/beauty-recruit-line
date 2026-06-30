// Groq API（優先）またはGemini APIを使ってテキスト生成する
async function callAI(messages: { role: string; content: string }[], maxTokens = 300, temperature = 0.7): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const result = await callGemini(geminiKey, messages, maxTokens, temperature);
    if (result) return result;
  }
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return callGroq(groqKey, messages, maxTokens, temperature);
  }
  return "";
}

async function callGroq(apiKey: string, messages: { role: string; content: string }[], maxTokens: number, temperature: number): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gemma2-9b-it",
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) return "";
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callGemini(apiKey: string, messages: { role: string; content: string }[], maxTokens: number, temperature: number): Promise<string> {
  const isOAuth = apiKey.startsWith("AQ.");
  const url = isOAuth
    ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isOAuth) headers["Authorization"] = `Bearer ${apiKey}`;

  const systemMsg = messages.find(m => m.role === "system");
  const userMsgs = messages.filter(m => m.role !== "system");

  const body: any = {
    contents: userMsgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) return "";
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

export async function askGemini(systemPrompt: string, userMessage: string): Promise<string> {
  return callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ], 300, 0.7);
}

export type Intent = "input" | "question" | "cancel" | "correction";

function keywordFallback(text: string): Intent {
  if (/やめ|中止|キャンセル|しない|不要|結構|いらない|断る|遠慮/.test(text)) return "cancel";
  if (/修正|訂正|間違|やり直|戻|変更/.test(text)) return "correction";
  if (/[？?]|こんにちは|はじめまして|よろしく|おはよう|こんばん|ありがとう|どう|教えて|なぜ|なんで|いつ|どこ|服装|持ち物|給料|待遇|休み|いいね|なるほど|そうか|そっか|へえ|ほんと|わかった|了解|オッケー|おk|ok|OK|すごい|いい感じ|楽しみ|嬉しい|よかった|助かり/.test(text)) return "question";
  return "input";
}

export async function classifyIntent(text: string, step: string): Promise<Intent> {
  const stepLabel: Record<string, string> = {
    school_name: "専門学校名を入力してもらうステップ",
    grad_year: "卒業予定年度（数字4桁）を入力してもらうステップ",
    pref_area: "希望勤務エリアを入力してもらうステップ",
    booking: "見学・説明会の予約枠を選んでもらうステップ",
  };
  const prompt = `You are a chatbot intent classifier. Classify the user message into exactly one of these four labels. Output only the label, nothing else.

Labels:
- input : The user is providing the expected information for this step (school name, graduation year, area, slot number, etc.)
- question : The user is asking a question, greeting, or making small talk
- cancel : The user wants to stop, cancel, or decline
- correction : The user wants to go back and fix a previous answer

Current step: ${stepLabel[step] ?? step}
User message: 「${text}」

Output one word only (input / question / cancel / correction):`;

  const raw = await callAI([{ role: "user", content: prompt }], 10, 0);

  const word = raw.toLowerCase().trim();
  if (word.startsWith("cancel") || word.includes("キャンセル") || word.includes("やめ")) return "cancel";
  if (word.startsWith("correction") || word.includes("修正") || word.includes("戻")) return "correction";
  if (word.startsWith("question") || word.includes("質問") || word.includes("挨拶")) return "question";
  if (!word) return keywordFallback(text);
  return "input";
}
