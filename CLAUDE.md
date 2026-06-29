# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

美容業界向け採用マネジメントツール。LINE Messaging API + Supabase + Next.js 14 で構築。

**主なフロー：**
1. 学生がLINE友だち追加 → Botがオンボーディング（学校名・卒業年度・希望エリアを順に質問）
2. 「予約」送信 → 空き枠一覧をクイックリプライで提示 → 番号選択で予約確定
3. 管理者は `/admin` でログインして予約・学生・枠を管理

## コマンド

```powershell
# 開発サーバー起動（Node.jsをPATHに通してから）
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
Set-Location "C:\Users\kashima.shuji\Downloads\beauty-recruit-line"
npm run dev

# ビルド確認（Vercelデプロイ前に必ず実行）
npm run build
```

ポートは3000〜3002のいずれか（起動時にコンソールで確認）。

## アーキテクチャ

### ディレクトリ構成

```
src/
  app/
    api/
      admin/          # 管理画面API（GET: 一覧取得 / POST: 各種操作）
        auth/         # ログイン・ログアウト・パスワード変更
      line/webhook/   # LINE本番用Webhook（署名検証あり）
      demo/webhook/   # デモ用Webhook（署名検証なし、quickRepliesを返す）
      reservations/   # 予約取得・作成API
      cron/reminders/ # 前日リマインド自動送信（Vercel Cron）
    admin/            # 管理画面UI（ログイン・テナント分離）
    demo/             # LINEチャット風デモページ
    liff/reserve/     # 予約カレンダー（将来のLIFF用、現在未使用）
  lib/
    supabase.ts       # supabaseAdminクライアント（service_role key、サーバー専用）
    line.ts           # pushText / multicastText / verifyLineSignature
    auth.ts           # セッション管理（httpOnly Cookie）
    schools.ts        # 全国美容学校リスト（約250校）と検索関数
    normalize.ts      # 全角→半角変換（数字・スペース）
supabase/
  schema.sql          # DBスキーマ定義
  seed.sql            # テストデータ
vercel.json           # Cron設定（毎日23:00 UTC = 翌8:00 JST）
```

### 重要な設計原則

**supabaseAdmin はサーバー専用**
`src/lib/supabase.ts` の `supabaseAdmin` は `service_role` キーを使用。クライアントコンポーネントや `"use client"` ファイルから絶対にimportしない。

**チャットBot状態管理**
`students` テーブルのカラムで状態を判定：
- `status = 'friend'` かつ `school_name IS NULL` → 学校名質問中
- `status = 'friend'` かつ `grad_year IS NULL` → 卒業年度質問中
- `status = 'friend'` かつ `pref_area IS NULL` → 希望エリア質問中
- `status = 'registered'` → 予約フロー
- `tags.manual_mode = true` → Bot返信スキップ（手動対応モード）
- `tags.pending_slots` → 予約選択中の枠IDリスト（一時保存）
- `tags.school_candidates` → 学校名候補リスト（一時保存）

**予約の排他制御**
`book_slot(p_student, p_slot)` PostgreSQL関数を使用。`FOR UPDATE` 行ロックで同時予約を防ぐ。直接 `insert` は使わない。

**マルチテナント構造**
`companies` テーブル → `stores.company_id` で紐付け。管理画面は会社ID+パスワードでログイン。`super` スラッグは全社閲覧（`SUPER_ADMIN_PASSWORD` 環境変数で認証）。

**デモページとLINE本番の違い**
- `/api/demo/webhook` → 署名検証なし、`{ replies, quickReplies }` をJSONで返す
- `/api/line/webhook` → HMAC-SHA256署名検証必須、LINE push APIで送信

**時刻はすべてUTCで保存**
`datetime-local` 入力値は `new Date(value).toISOString()` でUTC変換してから送信。一括作成APIは `${date}T${time}:00+09:00` 形式で組み立て。

## 環境変数

| 変数名 | 用途 |
|---|---|
| `SUPABASE_URL` | SupabaseプロジェクトURL |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー専用キー（公開禁止） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE push送信 |
| `LINE_CHANNEL_SECRET` | Webhook署名検証 |
| `NEXT_PUBLIC_LIFF_ID` | LIFF初期化（クライアント公開可） |
| `CRON_SECRET` | Cronエンドポイント保護 |
| `SUPER_ADMIN_PASSWORD` | スーパー管理者パスワード |

## デプロイ

- GitHub `main` ブランチへのpushでVercelが自動デプロイ
- **pushの前に必ず `npm run build` でビルドエラーを確認すること**
- 本番URL: `https://beauty-recruit-line.vercel.app`

## 主要URL

| URL | 用途 |
|---|---|
| `/demo` | LINEチャット風デモ（テスト用） |
| `/admin` | 管理画面（要ログイン） |
| `/liff/reserve?store_id=xxx&uid=xxx` | 予約カレンダー（現在未使用） |

## Supabase

- プロジェクトID: `elbmhksrfalscwethyvh`
- `book_slot()` / `cancel_reservation()` 関数はDBに定義済み
- `companies` テーブルのパスワードはSQLで直接変更可能（ハッシュ化未実装）
