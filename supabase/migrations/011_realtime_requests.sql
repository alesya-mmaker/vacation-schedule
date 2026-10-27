-- Оповещения об изменениях заявок (Supabase Realtime): новая заявка из формы или решение другого HR
-- сразу появляются в открытом разделе HR без обновления страницы.
-- Запустить в Supabase → SQL Editor после 010 (скрипт можно запускать повторно).
--
-- Оповещения получает только вошедший HR: Realtime соблюдает те же правила доступа, что и запросы,
-- а без входа заявки не читаются.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requests')
  then
    alter publication supabase_realtime add table requests;
  end if;
end $$;
