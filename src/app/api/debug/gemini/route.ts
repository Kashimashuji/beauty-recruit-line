import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const isOAuth = apiKey.startsWith("AQ.");
  const url = isOAuth
    ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isOAuth) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "こんにちはと返してください" }] }],
      generationConfig: { maxOutputTokens: 50, temperature: 0 },
    }),
  });

  const json = await res.json();
  return NextResponse.json({ status: res.status, keyType: isOAuth ? "OAuth(AQ.)" : "APIKey(AIza)", response: json });
}
