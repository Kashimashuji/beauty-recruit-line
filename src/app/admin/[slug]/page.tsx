"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!password) return;
    setLoading(true); setError("");
    const res = await fetch("/api/admin/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/admin");
    } else {
      const json = await res.json();
      setError(json.error ?? "パスワードが違います");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8f8", fontFamily: "Meiryo, sans-serif" }}>
      <div style={{ width: 360, padding: 40, background: "#fff", border: "1px solid #e5e5e5", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 6 }}>採用管理ダッシュボード</div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{slug}</h2>
        </div>
        {error && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <label style={{ display: "block", fontSize: 14, color: "#333", marginBottom: 14 }}>パスワード
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            placeholder="パスワードを入力"
            style={{ display: "block", width: "100%", padding: "10px 12px", marginTop: 4, border: "1px solid #ccc", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
          />
        </label>
        <button onClick={login} disabled={loading}
          style={{ width: "100%", padding: "12px 0", background: "#06c755", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
          {loading ? "確認中..." : "ログイン"}
        </button>
      </div>
    </div>
  );
}
