"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { from: "user" | "bot"; text: string };
type QuickReply = string;

const TEST_UID = "demo-user-" + Math.random().toString(36).slice(2, 8);

export default function DemoPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addMsg = (msg: Msg) => setMessages(prev => [...prev, msg]);

  // 初回: 友だち追加イベントを送信
  useEffect(() => {
    (async () => {
      setLoading(true);
      await sendWebhook({ type: "follow", source: { userId: TEST_UID } });
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendWebhook = async (event: object) => {
    const res = await fetch("/api/demo/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [event] }),
    });
    const json = await res.json();
    if (json.replies) {
      for (const text of json.replies) {
        addMsg({ from: "bot", text });
      }
    }
    setQuickReplies(json.quickReplies ?? []);
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setQuickReplies([]);
    addMsg({ from: "user", text });
    setLoading(true);
    await sendWebhook({
      type: "message",
      message: { type: "text", text },
      source: { userId: TEST_UID },
    });
    setLoading(false);
  };

  return (
    <div style={wrap}>
      <div style={header}>
        <div style={avatar}>🤖</div>
        <div>
          <div style={{ fontWeight: 700 }}>SEYFERT</div>
          <div style={{ fontSize: 12, color: "#aaa" }}>デモ（UID: {TEST_UID}）</div>
        </div>
      </div>

      <div style={chatArea}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
            {m.from === "bot" && <div style={botIcon}>🤖</div>}
            <div style={m.from === "user" ? userBubble : botBubble}>
              {m.text.split("\n").map((line, j) => (
                <span key={j}>{line}{j < m.text.split("\n").length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", marginBottom: 8 }}>
            <div style={botIcon}>🤖</div>
            <div style={{ ...botBubble, color: "#aaa" }}>入力中…</div>
          </div>
        )}
        {/* クイックリプライボタン */}
        {quickReplies.length > 0 && !loading && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", marginBottom: 8 }}>
            {quickReplies.map((label, i) => (
              <button key={i} onClick={() => send(label)} style={qrBtn}>{label}</button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={inputArea}>
        <input
          style={inputBox}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="メッセージを入力"
        />
        <button style={sendBtn} onClick={() => send()} disabled={loading}>送信</button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { maxWidth: 480, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "Meiryo, sans-serif", border: "1px solid #e5e5e5" };
const header: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#06c755", color: "#fff" };
const avatar: React.CSSProperties = { width: 40, height: 40, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 };
const chatArea: React.CSSProperties = { flex: 1, overflowY: "auto", padding: 16, background: "#f0f0f0" };
const botBubble: React.CSSProperties = { background: "#fff", padding: "10px 14px", borderRadius: "0 12px 12px 12px", maxWidth: 300, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" };
const userBubble: React.CSSProperties = { background: "#06c755", color: "#fff", padding: "10px 14px", borderRadius: "12px 0 12px 12px", maxWidth: 300, fontSize: 14, lineHeight: 1.6 };
const botIcon: React.CSSProperties = { width: 32, height: 32, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginRight: 8, flexShrink: 0, alignSelf: "flex-end" };
const inputArea: React.CSSProperties = { display: "flex", padding: "12px 16px", gap: 8, borderTop: "1px solid #e5e5e5", background: "#fff" };
const inputBox: React.CSSProperties = { flex: 1, padding: "10px 12px", border: "1px solid #ccc", borderRadius: 24, fontSize: 14, outline: "none" };
const sendBtn: React.CSSProperties = { padding: "10px 20px", background: "#06c755", color: "#fff", border: "none", borderRadius: 24, fontWeight: 700, cursor: "pointer" };
const qrBtn: React.CSSProperties = { padding: "8px 16px", background: "#fff", color: "#06c755", border: "2px solid #06c755", borderRadius: 20, fontWeight: 700, cursor: "pointer", fontSize: 13 };
