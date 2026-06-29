import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (groqKey) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: "「こんにちは」とだけ返してください" }],
        max_tokens: 50,
      }),
    });
    const json = await res.json();
    const reply = json.choices?.[0]?.message?.content ?? null;
    return NextResponse.json({ provider: "Groq", status: res.status, reply });
  }

  if (geminiKey) {
    return NextResponse.json({ provider: "Gemini", status: 0, reply: null, note: "Groq not set, Gemini fallback" });
  }

  return NextResponse.json({ error: "No API keys set" }, { status: 500 });
}
