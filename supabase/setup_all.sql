-- ============================================
-- 投入用: schema + seed 結合版
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run
-- ============================================

-- =====================================================================
-- 美容業界向け 採用マネジメントツール  MVP スキーマ
-- 対象フロー：友だち追加 → 会員証登録 → 店舗別予約 → リマインド → CI
-- =====================================================================

-- サロン（企業）
create table salons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- 店舗（サロンは複数店舗を持てる）
create table stores (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references salons(id) on delete cascade,
  name        text not null,
  address     text,
  created_at  timestamptz not null default now()
);

-- 学生（LINE友だち = 顧客）
create table students (
  id            uuid primary key default gen_random_uuid(),
  line_user_id  text not null unique,          -- 友だち追加時点で発番
  display_name  text,                          -- LINEプロフィール名
  full_name     text,                          -- 会員証フォーム：氏名
  full_name_kana text,
  school_name   text,                          -- 専門学校名
  grad_year     int,                           -- 卒業年度
  pref_area     text,                          -- 希望エリア
  entry_source  text,                          -- 流入元（QR識別子：fair / scout / sns 等）
  status        text not null default 'friend',-- friend/registered/booked/attended/no_show/interview/offer
  tags          jsonb not null default '[]',   -- セグメント配信用タグ
  registered_at timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_students_status on students(status);
create index idx_students_source on students(entry_source);

-- イベント種別：salon_visit（見学）/ briefing（説明会）/ consultation（個別相談）
create table reservation_slots (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  event_type    text not null default 'salon_visit',
  starts_at     timestamptz not null,
  capacity      int  not null default 1,
  booked_count  int  not null default 0,       -- 排他制御用カウンタ
  created_at    timestamptz not null default now(),
  constraint chk_capacity check (booked_count <= capacity)
);
create index idx_slots_store_time on reservation_slots(store_id, starts_at);

-- 予約
create table reservations (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  slot_id       uuid not null references reservation_slots(id) on delete cascade,
  status        text not null default 'booked',-- booked/attended/no_show/cancelled
  reminded_d1   boolean not null default false,-- 前日リマインド送信済み
  reminded_d0   boolean not null default false,-- 当日リマインド送信済み
  created_at    timestamptz not null default now(),
  unique(student_id, slot_id)
);
create index idx_res_slot on reservations(slot_id);

-- =====================================================================
-- 予約作成を1トランザクションで排他処理する関数
-- 定員オーバーや二重予約をDB側で防止する
-- =====================================================================
create or replace function book_slot(p_student uuid, p_slot uuid)
returns reservations
language plpgsql
as $$
declare
  v_slot reservation_slots;
  v_res  reservations;
begin
  -- 行ロックを取って定員を確認
  select * into v_slot from reservation_slots
    where id = p_slot for update;

  if v_slot is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;
  if v_slot.booked_count >= v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;

  insert into reservations(student_id, slot_id)
    values (p_student, p_slot)
    returning * into v_res;

  update reservation_slots
    set booked_count = booked_count + 1
    where id = p_slot;

  -- 学生ステータスを「予約済」へ前進（後退はさせない）
  update students set status = 'booked'
    where id = p_student and status in ('friend','registered');

  return v_res;
end;
$$;

-- キャンセル時にカウンタを戻す
create or replace function cancel_reservation(p_res uuid)
returns void
language plpgsql
as $$
declare
  v_res reservations;
begin
  select * into v_res from reservations where id = p_res for update;
  if v_res is null or v_res.status = 'cancelled' then
    return;
  end if;
  update reservations set status = 'cancelled' where id = p_res;
  update reservation_slots
    set booked_count = greatest(booked_count - 1, 0)
    where id = v_res.slot_id;
end;
$$;

-- ===== seed (動作確認用サンプルデータ) =====
-- 動作確認用のサンプルデータ
insert into salons(id, name) values
  ('11111111-1111-1111-1111-111111111111', 'AGUヘアサロン');
insert into stores(id, salon_id, name, address) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'AGU 渋谷店', '東京都渋谷区'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'AGU 新宿店', '東京都新宿区');
insert into reservation_slots(store_id, event_type, starts_at, capacity) values
  ('22222222-2222-2222-2222-222222222222', 'salon_visit', now() + interval '2 day', 3),
  ('22222222-2222-2222-2222-222222222222', 'salon_visit', now() + interval '3 day', 2),
  ('33333333-3333-3333-3333-333333333333', 'salon_visit', now() + interval '2 day', 1);

