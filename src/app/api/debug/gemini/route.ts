import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const results: any = {};

  if (geminiKey) {
    const isOAuth = geminiKey.startsWith("AQ.");
    const url = isOAuth
      ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`
      : `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isOAuth) headers["Authorization"] = `Bearer ${geminiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "「こんにちは」とだけ返してください" }] }],
        generationConfig: { maxOutputTokens: 50, temperature: 0 },
      }),
    });
    const json = await res.json();
    results.gemini = { status: res.status, reply: json.candidates?.[0]?.content?.parts?.[0]?.text ?? null, error: json.error ?? null };
  }

  if (groqKey) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "「こんにちは」とだけ返してください" }],
        max_tokens: 50,
      }),
    });
    const json = await res.json();
    results.groq = { status: res.status, reply: json.choices?.[0]?.message?.content ?? null, error: json.error ?? null };
  }

  return NextResponse.json(results);
}
