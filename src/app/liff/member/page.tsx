"use client";

import { useEffect, useState } from "react";

// LINEミニアプリ(LIFF)内で開く会員証登録フォーム。
// liff.init → getProfile で line_user_id を取得して送信する。
export default function MemberCardPage() {
  const [uid, setUid] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    full_name_kana: "",
    school_name: "",
    grad_year: "",
    pref_area: "",
  });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      // ローカル開発用: ?uid=xxx でline_user_idをモック
      const devUid = new URLSearchParams(window.location.search).get("uid");
      if (devUid) { setUid(devUid); return; }

      // @ts-ignore  LIFF SDKはindex.htmlでロード
      const liff = (window as any).liff;
      if (!liff) return;
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      const p = await liff.getProfile();
      setUid(p.userId);
    })();
  }, []);

  const submit = async () => {
    setErr("");
    // 流入元QRはURLパラメータ ?src=fair などで受け取る
    const src = new URLSearchParams(window.location.search).get("src") ?? "";
    const res = await fetch("/api/students/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        line_user_id: uid,
        ...form,
        grad_year: form.grad_year ? Number(form.grad_year) : null,
        entry_source: src,
      }),
    });
    if (res.ok) setDone(true);
    else setErr("登録に失敗しました。入力をご確認ください。");
  };

  if (done) {
    return (
      <main style={wrap}>
        <h2>登録ありがとうございます</h2>
        <p>メニューから見学予約に進めます。</p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h2 style={{ marginBottom: 16 }}>会員証の登録</h2>
      {[
        ["full_name", "氏名（漢字）", "山田 花子"],
        ["full_name_kana", "フリガナ", "ヤマダ ハナコ"],
        ["school_name", "専門学校名", "○○美容専門学校"],
        ["pref_area", "希望エリア", "東京都内"],
      ].map(([key, label, ph]) => (
        <label key={key} style={lbl}>
          {label}
          <input
            style={inp}
            placeholder={ph}
            value={(form as any)[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
        </label>
      ))}
      <label style={lbl}>
        卒業年度
        <input
          style={inp}
          type="number"
          placeholder="2027"
          value={form.grad_year}
          onChange={(e) => setForm({ ...form, grad_year: e.target.value })}
        />
      </label>
      {err && <p style={{ color: "#c0392b" }}>{err}</p>}
      <button style={btn} onClick={submit}>登録する</button>
    </main>
  );
}

const wrap: React.CSSProperties = { maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "Meiryo, sans-serif" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 12, fontSize: 14, color: "#333" };
const inp: React.CSSProperties = { width: "100%", padding: 12, marginTop: 4, border: "1px solid #ccc", borderRadius: 8, fontSize: 16 };
const btn: React.CSSProperties = { width: "100%", padding: 14, marginTop: 8, background: "#06c755", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 700 };
