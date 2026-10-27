-- Этап 2: запоминаем статус заявки до того, как она стала «заменена».
-- Нужно правилу «перенос не позднее чем за 14 дней»: оно касается только переноса согласованного отпуска.
-- Запустить один раз в Supabase → SQL Editor (в schema.sql и seed.sql это уже учтено).

alter table requests add column if not exists status_before_replace text
  check (status_before_replace in ('на рассмотрении', 'согласована', 'отклонена', 'согласована как исключение'));

update requests set status_before_replace = 'отклонена' where id = 10;
