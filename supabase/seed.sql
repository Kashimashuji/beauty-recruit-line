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
