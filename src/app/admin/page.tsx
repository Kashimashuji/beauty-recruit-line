"use client";

import { useEffect, useState } from "react";

type Store = { id: string; name: string };

const EVENT_TYPES = [
  { value: "salon_visit", label: "サロン見学" },
  { value: "briefing",    label: "説明会" },
  { value: "consultation", label: "個別相談" },
];

export default function AdminPage() {
  const [tab, setTab] = useState<"reservations" | "students" | "add_slot">("reservations");
  const [rows, setRows] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [slotForm, setSlotForm] = useState({
    store_id: "", event_type: "salon_visit", starts_at: "", capacity: "1",
  });
  const [slotMsg, setSlotMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin?view=stores").then(r => r.json()).then(j => setStores(j.stores ?? []));
  }, []);

  useEffect(() => {
    if (tab === "add_slot") return;
    (async () => {
      const res = await fetch(`/api/admin?view=${tab}`);
      const json = await res.json();
      setRows(tab === "students" ? json.students ?? [] : json.reservations ?? []);
    })();
  }, [tab]);

  const addSlot = async () => {
    setSlotMsg("");
    if (!slotForm.store_id || !slotForm.starts_at) {
      setSlotMsg("店舗と日時を入力してください。");
      return;
    }
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slotForm),
    });
    const json = await res.json();
    if (res.ok) {
      setSlotMsg("予約枠を追加しました。");
      setSlotForm({ store_id: slotForm.store_id, event_type: "salon_visit", starts_at: "", capacity: "1" });
    } else {
      setSlotMsg(`エラー: ${json.error}`);
    }
  };

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
        {(["reservations", "students", "add_slot"] as const).map((t) => (
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
            {t === "reservations" ? "予約一覧" : t === "students" ? "学生一覧" : "＋ 予約枠追加"}
          </button>
        ))}
      </div>

      {tab === "add_slot" && (
        <div style={{ maxWidth: 480 }}>
          {slotMsg && (
            <p style={{ color: slotMsg.startsWith("エラー") ? "#c0392b" : "#06803c", marginBottom: 12 }}>
              {slotMsg}
            </p>
          )}
          <label style={lbl}>
            店舗
            <select style={inp} value={slotForm.store_id} onChange={e => setSlotForm({ ...slotForm, store_id: e.target.value })}>
              <option value="">-- 選択してください --</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label style={lbl}>
            イベント種別
            <select style={inp} value={slotForm.event_type} onChange={e => setSlotForm({ ...slotForm, event_type: e.target.value })}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={lbl}>
            日時
            <input type="datetime-local" style={inp} value={slotForm.starts_at}
              onChange={e => setSlotForm({ ...slotForm, starts_at: e.target.value })} />
          </label>
          <label style={lbl}>
            定員（人数）
            <input type="number" min="1" style={inp} value={slotForm.capacity}
              onChange={e => setSlotForm({ ...slotForm, capacity: e.target.value })} />
          </label>
          <button style={addBtn} onClick={addSlot}>予約枠を追加する</button>
        </div>
      )}

      {tab !== "add_slot" && (<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
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
      </table>)}
      {tab !== "add_slot" && rows.length === 0 && <p style={{ marginTop: 20, color: "#999" }}>データがありません。</p>}
    </main>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 12px" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 14, fontSize: 14, color: "#333" };
const inp: React.CSSProperties = { display: "block", width: "100%", padding: "10px 12px", marginTop: 4, border: "1px solid #ccc", borderRadius: 8, fontSize: 15 };
const addBtn: React.CSSProperties = { marginTop: 8, padding: "12px 24px", background: "#06c755", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" };
