-- Справочник типов заявлений: HR добавляет новые типы и скрывает ненужные из формы.
-- Раньше список был зашит в схему (отпуск / без сохранения з/п / плановое лечение).
-- Запустить в Supabase → SQL Editor после 004 (скрипт можно запускать повторно).

create table if not exists request_types (
  name       text primary key,
  active     boolean not null default true, -- false: не показывается в форме, старые заявки остаются
  sort_order int not null default 0
);

insert into request_types (name, sort_order) values
  ('отпуск', 10),
  ('без сохранения з/п', 20),
  ('плановое лечение', 30)
on conflict (name) do nothing;

-- Тип заявки теперь проверяется по справочнику, а не по зашитому списку
alter table requests drop constraint if exists requests_type_check;
alter table requests drop constraint if exists requests_type_fkey;
alter table requests add constraint requests_type_fkey foreign key (type) references request_types(name);

-- Доступ: HR — всё, форма без входа — только действующие типы
alter table request_types enable row level security;
drop policy if exists "hr_all" on request_types;
drop policy if exists "form_active_types" on request_types;
revoke all on request_types from anon;
create policy "hr_all" on request_types for all to authenticated using (true) with check (true);
grant select, insert, update, delete on request_types to authenticated;
create policy "form_active_types" on request_types for select to anon using (active);
grant select (name, sort_order) on request_types to anon;
