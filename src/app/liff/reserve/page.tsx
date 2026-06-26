"use client";

import { useEffect, useState } from "react";

type Slot = { id: string; starts_at: string; remaining: number; capacity: number };

// 店舗別の見学予約。?store_id=xxx で店舗を指定。
export default function ReservePage() {
  const [uid, setUid] = useState("");
  const [storeId, setStoreId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("store_id") ?? "";
    setStoreId(sid);

    (async () => {
      // ローカル開発用: ?uid=xxx でモック
      const devUid = params.get("uid");
      if (devUid) {
        setUid(devUid);
      } else {
        // @ts-ignore
        const liff = (window as any).liff;
        if (liff) {
          await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
          if (!liff.isLoggedIn()) return liff.login();
          const p = await liff.getProfile();
          setUid(p.userId);
        }
      }

      if (!sid) return;
      const res = await fetch(`/api/reservations?store_id=${sid}`);
      const json = await res.json();
      setSlots(json.slots ?? []);
    })();
  }, []);

  const book = async (slotId: string) => {
    setMsg("");
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_user_id: uid, slot_id: slotId }),
    });
    const json = await res.json();
    if (res.ok) {
      setMsg("予約が完了しました。LINEに確認メッセージをお送りしました。");
      // 残席を即時更新
      setSlots((prev) =>
        prev.map((s) => (s.id === slotId ? { ...s, remaining: s.remaining - 1 } : s))
      );
    } else {
      setMsg(json.error ?? "予約に失敗しました。");
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <main style={wrap}>
      <h2 style={{ marginBottom: 16 }}>サロン見学を予約</h2>
      {msg && <p style={{ color: "#06803c", marginBottom: 12 }}>{msg}</p>}
      {slots.length === 0 && <p>現在予約可能な枠がありません。</p>}
      {slots.map((s) => (
        <div key={s.id} style={card}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(s.starts_at)}</div>
            <div style={{ fontSize: 13, color: "#777" }}>残り {s.remaining} 名</div>
          </div>
          <button
            style={{ ...btn, opacity: s.remaining > 0 ? 1 : 0.4 }}
            disabled={s.remaining <= 0}
            onClick={() => book(s.id)}
          >
            {s.remaining > 0 ? "予約する" : "満席"}
          </button>
        </div>
      ))}
    </main>
  );
}

const wrap: React.CSSProperties = { maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "Meiryo, sans-serif" };
const card: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, marginBottom: 10, border: "1px solid #e5e5e5", borderRadius: 10 };
const btn: React.CSSProperties = { padding: "10px 18px", background: "#06c755", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" };
