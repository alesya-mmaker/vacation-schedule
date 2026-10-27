-- Пометка «новая»: когда HR впервые открыл заявку. Пусто — заявку ещё никто не открывал.
-- Запустить в Supabase → SQL Editor (скрипт можно запускать повторно).

alter table requests add column if not exists viewed_at timestamptz;

-- Уже решённые заявки считаем просмотренными; заявки на рассмотрении остаются «новыми»
update requests set viewed_at = decided_at where viewed_at is null and decided_at is not null;
