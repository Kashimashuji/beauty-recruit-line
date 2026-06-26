# 美容業界向け 採用マネジメントツール（MVP）

KAKERU相当のLINE採用CRMを自社開発するためのMVPリポジトリです。
今回実装したのは中核フロー1本：

**友だち追加 → 会員証登録 → 店舗別見学予約 → 自動リマインド → 管理画面で確認**

## 技術構成

- Next.js (App Router) — LIFF画面・管理画面・APIを1リポジトリに集約
- Supabase (PostgreSQL) — 学生・予約データ。予約の排他制御はDB関数で実装
- LINE Messaging API — プッシュ通知・リマインド・（将来の）セグメント配信
- Vercel Cron — 前日・当日リマインドの定期実行

## セットアップ手順

1. 依存インストール
   ```
   npm install
   ```
2. Supabaseでプロジェクト作成後、SQLエディタで実行
   ```
   supabase/schema.sql  → supabase/seed.sql（動作確認用）
   ```
3. LINE Developersで Messaging APIチャネル と LIFFアプリ を作成
   - LIFFのエンドポイント：`https://<your-domain>/liff/member` と `/liff/reserve`
   - Webhook URL：`https://<your-domain>/api/line/webhook`
4. `.env.example` を `.env.local` にコピーして値を設定
5. 起動
   ```
   npm run dev
   ```

## 画面・エンドポイント

| パス | 役割 |
|---|---|
| `/liff/member` | 学生用 会員証登録フォーム |
| `/liff/reserve?store_id=xxx` | 学生用 店舗別予約カレンダー |
| `/admin` | サロン担当者用 管理画面（予約一覧／学生一覧） |
| `POST /api/line/webhook` | 友だち追加で自動的にstudents登録 |
| `POST /api/students/register` | 会員証フォーム送信先 |
| `GET/POST /api/reservations` | 空き枠取得 / 予約作成（排他制御つき） |
| `GET /api/cron/reminders` | リマインド送信（Cronから実行） |

## ステータス遷移

```
friend → registered → booked → attended / no_show → interview → offer
```
予約や登録でステータスが前進し、後退はしない設計です。

## 流入元（QR別）分析について

会員証LIFFを `?src=fair`（就職フェア）, `?src=scout`, `?src=sns` のように
QRごとに出し分けると、`students.entry_source` に記録され管理画面で識別できます。

## 次フェーズ（Phase2）候補

- くじ引き（ガチャ）機能 + 結果別クーポン配信
- リッチメニューの選考フェーズ自動切替
- セグメント配信UI（multicastは実装済み、配信対象の絞り込みUIを追加）
- チェックイン（QR読取）でのstatus自動更新

## セキュリティ上の本番対応TODO

- LIFFのIDトークンをサーバー側で検証し、`line_user_id` の詐称を防ぐ
  （現状はフォーム送信値を信頼している。本番前に必須）
- 管理画面に認証（Supabase Auth等）を追加
- 個人情報の取扱い同意フローと保持期間の設計
