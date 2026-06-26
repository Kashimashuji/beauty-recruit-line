"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [tab, setTab] = useState<"reservations" | "students">("reservations");
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin?view=${tab}`);
      const json = await res.json();
      setRows(tab === "students" ? json.students ?? [] : json.reservations ?? []);
    })();
  }, [tab]);

  const fmt = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

  const statusLabel: Record<string, string> = {
    friend: "友だち", registered: "会員登録済", booked: "予約済",
    attended: "参加済", no_show: "不参加", interview: "面接予定", offer: "内定",
    cancelled: "キャンセル",
  };

  return (
    <main style={{ padding: 32, fontFamily: "Meiryo, sans-serif" }}>
      <h1 style={{ marginBottom: 20 }}>採用管理ダッシュボード</h1>
      <div style={{ marginBottom: 16 }}>
        {(["reservations", "students"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px", marginRight: 8, border: "none", borderRadius: 6,
              cursor: "pointer", fontWeight: 700,
              background: tab === t ? "#06c755" : "#eee",
              color: tab === t ? "#fff" : "#333",
            }}
          >
            {t === "reservations" ? "予約一覧" : "学生一覧"}
          </button>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
            {tab === "reservations" ? (
              <>
                <th style={th}>学生</th><th style={th}>学校</th>
                <th style={th}>店舗</th><th style={th}>見学日時</th><th style={th}>状態</th>
              </>
            ) : (
              <>
                <th style={th}>氏名</th><th style={th}>学校</th><th style={th}>卒業年度</th>
                <th style={th}>希望エリア</th><th style={th}>流入元</th><th style={th}>状態</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
              {tab === "reservations" ? (
                <>
                  <td style={td}>{r.students?.full_name ?? "-"}</td>
                  <td style={td}>{r.students?.school_name ?? "-"}</td>
                  <td style={td}>{r.reservation_slots?.stores?.name ?? "-"}</td>
                  <td style={td}>{fmt(r.reservation_slots?.starts_at)}</td>
                  <td style={td}>{statusLabel[r.status] ?? r.status}</td>
                </>
              ) : (
                <>
                  <td style={td}>{r.full_name ?? "-"}</td>
                  <td style={td}>{r.school_name ?? "-"}</td>
                  <td style={td}>{r.grad_year ?? "-"}</td>
                  <td style={td}>{r.pref_area ?? "-"}</td>
                  <td style={td}>{r.entry_source || "-"}</td>
                  <td style={td}>{statusLabel[r.status] ?? r.status}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ marginTop: 20, color: "#999" }}>データがありません。</p>}
    </main>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 12px" };
