"use client";

import { useEffect, useState } from "react";

type SessionInfo = { role: "super" } | { role: "company"; company_name: string };

function LoginScreen({ onLogin }: { onLogin: (s: SessionInfo) => void }) {
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!slug || !password) return;
    setLoading(true); setError("");
    const res = await fetch("/api/admin/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, password }),
    });
    const json = await res.json();
    setLoading(false);
    if (res.ok) {
      onLogin(json.role === "super" ? { role: "super" } : { role: "company", company_name: json.company_name ?? slug });
    } else {
      setError(json.error ?? "ログインに失敗しました");
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 32, border: "1px solid #e5e5e5", borderRadius: 12, fontFamily: "Meiryo, sans-serif" }}>
      <h2 style={{ marginBottom: 24, textAlign: "center" }}>管理画面ログイン</h2>
      {error && <p style={{ color: "#c0392b", marginBottom: 12, fontSize: 14 }}>{error}</p>}
      <label style={lbl}>会社ID（スラッグ）
        <input style={inp} value={slug} onChange={e => setSlug(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()} placeholder="例: agu" />
      </label>
      <label style={lbl}>パスワード
        <input type="password" style={inp} value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()} placeholder="パスワード" />
      </label>
      <button onClick={login} disabled={loading} style={{ ...addBtn, width: "100%", marginTop: 8 }}>
        {loading ? "確認中..." : "ログイン"}
      </button>
    </div>
  );
}

type Store = { id: string; name: string };
type Slot = { id: string; store_id: string; event_type: string; starts_at: string; capacity: number; booked_count: number; stores?: { name: string } };
type Student = { id: string; full_name: string | null; display_name: string | null; school_name: string | null; grad_year: number | null; pref_area: string | null; entry_source: string | null; status: string; tags: any; line_user_id: string | null };

const EVENT_TYPES = [
  { value: "salon_visit", label: "サロン見学" },
  { value: "briefing",    label: "説明会" },
  { value: "consultation", label: "個別相談" },
];

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const eventLabel: Record<string, string> = {
  salon_visit: "サロン見学", briefing: "説明会", consultation: "個別相談",
};
const statusLabel: Record<string, string> = {
  friend: "友だち", registered: "会員登録済", booked: "予約済",
  attended: "参加済", no_show: "不参加", interview: "面接予定", offer: "内定",
  cancelled: "キャンセル",
};

export default function AdminPage() {
  const [session, setSession] = useState<SessionInfo | null | "loading">("loading");
  const [tab, setTab] = useState<"reservations" | "students" | "add_slot" | "slots">("reservations");
  const [rows, setRows] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [msg, setMsg] = useState("");
  const [manualTarget, setManualTarget] = useState<Student | null>(null);
  const [manualMsg, setManualMsg] = useState("");

  // 単体フォーム
  const [singleForm, setSingleForm] = useState({
    store_id: "", event_type: "salon_visit", starts_at: "", capacity: "1",
  });

  // 一括作成フォーム
  const [bulkForm, setBulkForm] = useState({
    store_id: "", event_type: "salon_visit",
    start_date: "", end_date: "", weekdays: [] as number[],
    time: "10:00", capacity: "1",
  });

  // コピー用
  const [copySlot, setCopySlot] = useState<Slot | null>(null);
  const [copyOffset, setCopyOffset] = useState("7");

  // 編集用
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [editForm, setEditForm] = useState({ store_id: "", event_type: "salon_visit", starts_at: "", capacity: "1" });

  // 選択・一括削除用
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [addMode, setAddMode] = useState<"single" | "bulk">("single");

  useEffect(() => {
    // セッション確認（401なら未ログイン）
    fetch("/api/admin?view=stores").then(r => {
      if (r.status === 401) { setSession(null); return { stores: [] }; }
      setSession(prev => prev === "loading" ? { role: "company", company_name: "" } : prev);
      return r.json();
    }).then(j => setStores(j.stores ?? []));
  }, []);

  const logout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setSession(null);
    setRows([]); setSlots([]);
  };

  if (session === "loading") return <div style={{ padding: 40, fontFamily: "Meiryo, sans-serif" }}>読み込み中...</div>;
  if (session === null) return <LoginScreen onLogin={s => { setSession(s); location.reload(); }} />;

  useEffect(() => {
    if (tab === "add_slot") return;
    if (tab === "slots") {
      fetch("/api/admin?view=slots").then(r => r.json()).then(j => setSlots(j.slots ?? []));
      return;
    }
    (async () => {
      const res = await fetch(`/api/admin?view=${tab}`);
      const json = await res.json();
      setRows(tab === "students" ? json.students ?? [] : json.reservations ?? []);
    })();
  }, [tab]);

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const toggleManual = async (student: Student) => {
    const next = !student.tags?.manual_mode;
    await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_manual", student_id: student.id, manual_mode: next }),
    });
    setRows(prev => prev.map(r => r.id === student.id ? { ...r, tags: { ...r.tags, manual_mode: next } } : r));
    if (next) { setManualTarget({ ...student, tags: { ...student.tags, manual_mode: true } }); }
    else { if (manualTarget?.id === student.id) setManualTarget(null); }
    showMsg(next ? `${student.display_name ?? student.school_name ?? "学生"}さんを手動対応モードにしました` : "Bot自動返信に戻しました");
  };

  const sendManual = async () => {
    if (!manualTarget || !manualMsg.trim()) return;
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_message", student_id: manualTarget.id, message: manualMsg.trim() }),
    });
    const json = await res.json();
    if (res.ok) {
      showMsg(json.sent ? "LINEで送信しました" : "送信記録しました（LINE未接続のため実際には未送信）");
      setManualMsg("");
    } else { showMsg(`❌ ${json.error}`); }
  };

  const addSingle = async () => {
    if (!singleForm.store_id || !singleForm.starts_at) { showMsg("❌ 店舗と日時を入力してください。"); return; }
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "single", ...singleForm, starts_at: new Date(singleForm.starts_at).toISOString() }),
    });
    const json = await res.json();
    if (res.ok) { showMsg("✅ 予約枠を追加しました。"); setSingleForm({ store_id: singleForm.store_id, event_type: "salon_visit", starts_at: "", capacity: "1" }); }
    else showMsg(`❌ ${json.error}`);
  };

  const addBulk = async () => {
    if (!bulkForm.store_id || !bulkForm.start_date || !bulkForm.end_date || bulkForm.weekdays.length === 0) {
      showMsg("❌ 店舗・期間・曜日を入力してください。"); return;
    }
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk", ...bulkForm }),
    });
    const json = await res.json();
    if (res.ok) { showMsg(`✅ ${json.count}件の予約枠を作成しました。`); }
    else showMsg(`❌ ${json.error}`);
  };

  const openEdit = (s: Slot) => {
    setEditSlot(s);
    const local = new Date(s.starts_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localStr = `${local.getFullYear()}-${pad(local.getMonth()+1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    setEditForm({ store_id: s.store_id, event_type: s.event_type, starts_at: localStr, capacity: String(s.capacity) });
  };

  const saveEdit = async () => {
    if (!editSlot) return;
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_slot", slot_id: editSlot.id, ...editForm, starts_at: new Date(editForm.starts_at).toISOString() }),
    });
    const json = await res.json();
    if (res.ok) {
      showMsg("✅ 枠を更新しました。");
      setEditSlot(null);
      fetch("/api/admin?view=slots").then(r => r.json()).then(j => setSlots(j.slots ?? []));
    } else showMsg(`❌ ${json.error}`);
  };

  const deleteSlot = async (s: Slot) => {
    if (!confirm(`この枠を削除しますか？\n${fmt(s.starts_at)}`)) return;
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_slot", slot_id: s.id }),
    });
    const json = await res.json();
    if (res.ok) {
      showMsg("✅ 枠を削除しました。");
      setSlots(prev => prev.filter(x => x.id !== s.id));
    } else showMsg(`❌ ${json.error}`);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleSelectAll = () => {
    const deletable = slots.filter(s => (s.booked_count ?? 0) === 0).map(s => s.id);
    if (deletable.every(id => selectedIds.has(id)) && deletable.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(deletable));
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`選択した${selectedIds.size}件の枠を削除しますか？`)) return;
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_delete_slots", slot_ids: Array.from(selectedIds) }),
    });
    const json = await res.json();
    if (res.ok) {
      showMsg(`✅ ${json.count}件を削除しました。`);
      setSlots(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } else showMsg(`❌ ${json.error}`);
  };

  const doCopy = async () => {
    if (!copySlot) return;
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "copy", slot_id: copySlot.id, offset_days: Number(copyOffset) }),
    });
    const json = await res.json();
    if (res.ok) {
      showMsg("✅ 枠をコピーしました。");
      setCopySlot(null);
      fetch("/api/admin?view=slots").then(r => r.json()).then(j => setSlots(j.slots ?? []));
    } else showMsg(`❌ ${json.error}`);
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "-";

  const toggleWeekday = (d: number) =>
    setBulkForm(f => ({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter(x => x !== d) : [...f.weekdays, d] }));

  const tabs = [
    { key: "reservations", label: "予約一覧" },
    { key: "students",     label: "学生一覧" },
    { key: "slots",        label: "枠一覧" },
    { key: "add_slot",     label: "＋ 予約枠追加" },
  ] as const;

  return (
    <main style={{ padding: 32, fontFamily: "Meiryo, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1>採用管理ダッシュボード
          {session && session.role === "super" && <span style={{ fontSize: 13, color: "#06c755", marginLeft: 10, fontWeight: 400 }}>スーパー管理者</span>}
          {session && session.role === "company" && <span style={{ fontSize: 13, color: "#666", marginLeft: 10, fontWeight: 400 }}>{session.company_name}</span>}
        </h1>
        <button onClick={logout} style={{ padding: "6px 16px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 }}>ログアウト</button>
      </div>

      {/* タブ */}
      <div style={{ marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 20px", marginRight: 8, border: "none", borderRadius: 6,
            cursor: "pointer", fontWeight: 700,
            background: tab === t.key ? "#06c755" : "#eee",
            color: tab === t.key ? "#fff" : "#333",
          }}>{t.label}</button>
        ))}
      </div>

      {/* フラッシュメッセージ */}
      {msg && <p style={{ marginBottom: 16, color: msg.startsWith("❌") ? "#c0392b" : "#06803c" }}>{msg}</p>}

      {/* 予約枠追加タブ */}
      {tab === "add_slot" && (
        <div style={{ maxWidth: 520 }}>
          {/* モード切り替え */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {(["single", "bulk"] as const).map(m => (
              <button key={m} onClick={() => setAddMode(m)} style={{
                padding: "8px 20px", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700,
                background: addMode === m ? "#333" : "#eee", color: addMode === m ? "#fff" : "#333",
              }}>{m === "single" ? "1枠追加" : "期間一括作成"}</button>
            ))}
          </div>

          {addMode === "single" && (
            <>
              <label style={lbl}>店舗
                <select style={inp} value={singleForm.store_id} onChange={e => setSingleForm({ ...singleForm, store_id: e.target.value })}>
                  <option value="">-- 選択 --</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={lbl}>イベント種別
                <select style={inp} value={singleForm.event_type} onChange={e => setSingleForm({ ...singleForm, event_type: e.target.value })}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label style={lbl}>日時
                <input type="datetime-local" style={inp} value={singleForm.starts_at}
                  onChange={e => setSingleForm({ ...singleForm, starts_at: e.target.value })} />
              </label>
              <label style={lbl}>定員（人数）
                <input type="number" min="1" style={inp} value={singleForm.capacity}
                  onChange={e => setSingleForm({ ...singleForm, capacity: e.target.value })} />
              </label>
              <button style={addBtn} onClick={addSingle}>予約枠を追加する</button>
            </>
          )}

          {addMode === "bulk" && (
            <>
              <label style={lbl}>店舗
                <select style={inp} value={bulkForm.store_id} onChange={e => setBulkForm({ ...bulkForm, store_id: e.target.value })}>
                  <option value="">-- 選択 --</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={lbl}>イベント種別
                <select style={inp} value={bulkForm.event_type} onChange={e => setBulkForm({ ...bulkForm, event_type: e.target.value })}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                <label style={{ ...lbl, flex: 1, marginBottom: 0 }}>開始日
                  <input type="date" style={inp} value={bulkForm.start_date}
                    onChange={e => setBulkForm({ ...bulkForm, start_date: e.target.value })} />
                </label>
                <label style={{ ...lbl, flex: 1, marginBottom: 0 }}>終了日
                  <input type="date" style={inp} value={bulkForm.end_date}
                    onChange={e => setBulkForm({ ...bulkForm, end_date: e.target.value })} />
                </label>
              </div>
              <div style={{ marginBottom: 14, fontSize: 14, color: "#333" }}>
                曜日（複数選択可）
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {WEEKDAY_LABELS.map((w, i) => (
                    <button key={i} onClick={() => toggleWeekday(i)} style={{
                      width: 36, height: 36, borderRadius: "50%", border: "2px solid",
                      borderColor: bulkForm.weekdays.includes(i) ? "#06c755" : "#ccc",
                      background: bulkForm.weekdays.includes(i) ? "#06c755" : "#fff",
                      color: bulkForm.weekdays.includes(i) ? "#fff" : "#333",
                      fontWeight: 700, cursor: "pointer", fontSize: 13,
                    }}>{w}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                <label style={{ ...lbl, flex: 1, marginBottom: 0 }}>開始時刻
                  <input type="time" style={inp} value={bulkForm.time}
                    onChange={e => setBulkForm({ ...bulkForm, time: e.target.value })} />
                </label>
                <label style={{ ...lbl, flex: 1, marginBottom: 0 }}>定員
                  <input type="number" min="1" style={inp} value={bulkForm.capacity}
                    onChange={e => setBulkForm({ ...bulkForm, capacity: e.target.value })} />
                </label>
              </div>
              <button style={addBtn} onClick={addBulk}>一括作成する</button>
            </>
          )}
        </div>
      )}

      {/* 枠一覧タブ（コピー機能付き） */}
      {tab === "slots" && (
        <>
          {/* 編集パネル */}
          {editSlot && (
            <div style={{ marginBottom: 20, padding: 16, background: "#e3f2fd", borderRadius: 10, maxWidth: 520, border: "1px solid #90caf9" }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>枠を編集</div>
              <label style={lbl}>店舗
                <select style={inp} value={editForm.store_id} onChange={e => setEditForm({ ...editForm, store_id: e.target.value })}>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={lbl}>イベント種別
                <select style={inp} value={editForm.event_type} onChange={e => setEditForm({ ...editForm, event_type: e.target.value })}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label style={lbl}>日時
                <input type="datetime-local" style={inp} value={editForm.starts_at}
                  onChange={e => setEditForm({ ...editForm, starts_at: e.target.value })} />
              </label>
              <label style={lbl}>定員
                <input type="number" min="1" style={inp} value={editForm.capacity}
                  onChange={e => setEditForm({ ...editForm, capacity: e.target.value })} />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={addBtn} onClick={saveEdit}>保存</button>
                <button onClick={() => setEditSlot(null)} style={{ padding: "12px 16px", border: "1px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>キャンセル</button>
              </div>
            </div>
          )}

          {copySlot && (
            <div style={{ marginBottom: 20, padding: 16, background: "#f0f9f0", borderRadius: 10, maxWidth: 480 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>コピー元: {fmt(copySlot.starts_at)} ｜ {(copySlot.stores as any)?.name ?? ""} ｜ {eventLabel[copySlot.event_type] ?? copySlot.event_type}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ fontSize: 14 }}>
                  {" "}日後にコピー
                  <input type="number" min="1" value={copyOffset}
                    onChange={e => setCopyOffset(e.target.value)}
                    style={{ ...inp, width: 80, display: "inline-block", marginLeft: 8, marginTop: 0 }} />
                </label>
                <button style={addBtn} onClick={doCopy}>コピー実行</button>
                <button onClick={() => setCopySlot(null)} style={{ padding: "10px 16px", border: "1px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer" }}>キャンセル</button>
              </div>
            </div>
          )}
          {/* 一括削除バー */}
          {selectedIds.size > 0 && (
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 14, color: "#333" }}>{selectedIds.size}件選択中</span>
              <button onClick={bulkDelete} style={{ padding: "6px 18px", background: "#c62828", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                一括削除
              </button>
              <button onClick={() => setSelectedIds(new Set())} style={{ padding: "6px 12px", background: "#eee", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                選択解除
              </button>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                <th style={th}>
                  <input type="checkbox"
                    onChange={toggleSelectAll}
                    checked={slots.filter(s => (s.booked_count ?? 0) === 0).length > 0 && slots.filter(s => (s.booked_count ?? 0) === 0).every(s => selectedIds.has(s.id))}
                  />
                </th>
                <th style={th}>日時</th><th style={th}>店舗</th><th style={th}>種別</th>
                <th style={th}>定員</th><th style={th}>予約数</th><th style={th} colSpan={3}>操作</th>
              </tr>
            </thead>
            <tbody>
              {slots.map(s => {
                const hasBooking = (s.booked_count ?? 0) > 0;
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #eee", background: selectedIds.has(s.id) ? "#fce4ec" : "transparent" }}>
                    <td style={td}>
                      <input type="checkbox" disabled={hasBooking} checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelect(s.id)} />
                    </td>
                    <td style={td}>{fmt(s.starts_at)}</td>
                    <td style={td}>{(s.stores as any)?.name ?? "-"}</td>
                    <td style={td}>{eventLabel[s.event_type] ?? s.event_type}</td>
                    <td style={td}>{s.capacity}</td>
                    <td style={td}>{s.booked_count ?? 0}</td>
                    <td style={td}>
                      <button onClick={() => openEdit(s)} style={slotBtn("#e3f2fd", "#1565c0")}>編集</button>
                    </td>
                    <td style={td}>
                      <button onClick={() => { setCopySlot(s); setCopyOffset("7"); }} style={slotBtn("#e8f5e9", "#06803c")}>コピー</button>
                    </td>
                    <td style={td}>
                      <button onClick={() => deleteSlot(s)} disabled={hasBooking}
                        style={slotBtn("#ffebee", hasBooking ? "#bbb" : "#c62828", hasBooking)}
                        title={hasBooking ? "予約済みのため削除不可" : ""}
                      >削除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {slots.length === 0 && <p style={{ marginTop: 20, color: "#999" }}>データがありません。</p>}
        </>
      )}

      {/* 予約一覧・学生一覧 */}
      {(tab === "reservations" || tab === "students") && (
        <>
          {/* 手動対応パネル */}
          {tab === "students" && manualTarget && (
            <div style={{ marginBottom: 20, padding: 16, background: "#fff8e1", borderRadius: 10, maxWidth: 520, border: "1px solid #ffc107" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                🟡 手動対応中：{manualTarget.display_name ?? manualTarget.school_name ?? "学生"}さん
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Bot自動返信は停止中です</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={manualMsg}
                  onChange={e => setManualMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendManual()}
                  placeholder="メッセージを入力してEnter"
                  style={{ ...inp, marginTop: 0, flex: 1 }}
                />
                <button onClick={sendManual} style={{ ...addBtn, marginTop: 0, whiteSpace: "nowrap" }}>送信</button>
              </div>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                {tab === "reservations" ? (
                  <><th style={th}>学生</th><th style={th}>学校</th><th style={th}>店舗</th><th style={th}>見学日時</th><th style={th}>状態</th></>
                ) : (
                  <><th style={th}>氏名</th><th style={th}>学校</th><th style={th}>卒業年度</th><th style={th}>希望エリア</th><th style={th}>状態</th><th style={th}>予約日時</th><th style={th}>対応</th></>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid #eee", background: r.tags?.manual_mode ? "#fffde7" : "transparent" }}>
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
                      <td style={td}>{r.display_name ?? r.full_name ?? "-"}</td>
                      <td style={td}>{r.school_name ?? "-"}</td>
                      <td style={td}>{r.grad_year ?? "-"}</td>
                      <td style={td}>{r.pref_area ?? "-"}</td>
                      <td style={td}>{statusLabel[r.status] ?? r.status}</td>
                      <td style={td}>{r.booked_at ? fmt(r.booked_at) : "-"}</td>
                      <td style={td}>
                        <button
                          onClick={() => toggleManual(r as Student)}
                          style={{
                            padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                            background: r.tags?.manual_mode ? "#ffc107" : "#eee",
                            color: r.tags?.manual_mode ? "#333" : "#666",
                          }}
                        >{r.tags?.manual_mode ? "🟡 手動中" : "Bot"}</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p style={{ marginTop: 20, color: "#999" }}>データがありません。</p>}
        </>
      )}
    </main>
  );
}

const slotBtn = (bg: string, color: string, disabled = false): React.CSSProperties => ({
  padding: "4px 12px", background: disabled ? "#f5f5f5" : bg,
  border: `1px solid ${color}`, borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 13, color: disabled ? "#bbb" : color, fontWeight: 700,
});
const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 12px" };
const lbl: React.CSSProperties = { display: "block", marginBottom: 14, fontSize: 14, color: "#333" };
const inp: React.CSSProperties = { display: "block", width: "100%", padding: "10px 12px", marginTop: 4, border: "1px solid #ccc", borderRadius: 8, fontSize: 15, boxSizing: "border-box" };
const addBtn: React.CSSProperties = { marginTop: 8, padding: "12px 24px", background: "#06c755", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" };
