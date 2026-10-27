-- Действия HR одной операцией в базе. Запустить в Supabase → SQL Editor после 009
-- (скрипт можно запускать повторно).
--
-- decide_request — решение по заявке: статус и сообщение сотруднику сохраняются вместе
-- (или не сохраняется ничего). Решение принимается, только если заявка всё ещё «на рассмотрении»:
-- если другой HR уже решил её или сотрудник заменил её новой, база откажет.
--
-- replace_rule_results — сохранение результатов проверки: удалить старые и записать новые
-- одной операцией. Одновременные сохранения из нескольких вкладок выполняются по очереди.
--
-- Обе функции работают с правами вызывающего: без входа (anon) они недоступны.

create or replace function decide_request(
  p_request bigint, p_status text, p_hr_comment text, p_kind text, p_message text
) returns void
language plpgsql set search_path = public as $$
declare
  v_employee bigint;
begin
  update requests
  set status = p_status, hr_comment = nullif(trim(p_hr_comment), ''), decided_at = now()
  where id = p_request and status = 'на рассмотрении'
  returning employee_id into v_employee;

  if v_employee is null then
    raise exception 'Заявку уже обработали или заменили новой. Обновите страницу.';
  end if;

  insert into outbox (employee_id, request_id, kind, text) values (v_employee, p_request, p_kind, p_message);
end $$;

create or replace function replace_rule_results(p_results jsonb) returns void
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('replace_rule_results'));
  delete from rule_results where true;
  insert into rule_results (request_id, rule_id, passed, possible_conflict, message)
  select request_id, rule_id, passed, possible_conflict, message
  from jsonb_populate_recordset(null::rule_results, p_results)
  -- заявку или правило могли удалить, пока шёл пересчёт
  where exists (select 1 from requests r where r.id = request_id)
    and exists (select 1 from rules u where u.id = rule_id);
end $$;

revoke execute on function decide_request(bigint, text, text, text, text) from public, anon;
revoke execute on function replace_rule_results(jsonb) from public, anon;
grant execute on function decide_request(bigint, text, text, text, text) to authenticated;
grant execute on function replace_rule_results(jsonb) to authenticated;
