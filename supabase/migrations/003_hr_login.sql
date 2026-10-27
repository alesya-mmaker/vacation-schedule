-- Вход для HR. Запустить в Supabase → SQL Editor (скрипт можно запускать повторно).
--
-- Кто что может:
--   HR (вошёл по email и паролю, роль authenticated) — всё.
--   Сотрудник (форма без входа, роль anon) — только видеть список работающих сотрудников
--   (ФИО и руководитель, без табельных номеров) и подать заявление через функцию submit_request.
--   Заявки, правила, сообщения и т.д. без входа не читаются и не меняются.

do $$
declare t text;
begin
  foreach t in array array['units', 'employees', 'requests', 'rules', 'rule_results', 'message_templates', 'outbox'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "prototype_all" on %I', t);
    execute format('drop policy if exists "hr_all" on %I', t);
    execute format('revoke all on %I from anon', t);
    execute format('create policy "hr_all" on %I for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

revoke all on all sequences in schema public from anon;
grant usage, select on all sequences in schema public to authenticated;

-- Форма: список работающих сотрудников, только нужные поля
drop policy if exists "form_active_employees" on employees;
create policy "form_active_employees" on employees for select to anon using (active);
grant select (id, full_name, manager_id, active) on employees to anon;

-- Форма: даты прежнего заявления для корректировки (только если оно этого же сотрудника и ещё не заменено)
create or replace function replaceable_request(p_employee bigint, p_request bigint)
returns table (start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select r.start_date, r.end_date from requests r
  where r.id = p_request and r.employee_id = p_employee and r.status <> 'заменена'
$$;

-- Форма: подать заявление. Если это корректировка, прежняя заявка становится «заменена»,
-- а её прежний статус сохраняется (нужен правилу о переносе согласованного отпуска).
create or replace function submit_request(
  p_employee bigint, p_type text, p_start date, p_end date,
  p_substitute bigint, p_comment text, p_replaces bigint
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_prev requests%rowtype;
begin
  if not exists (select 1 from employees where id = p_employee and active) then
    raise exception 'Сотрудник не найден';
  end if;
  if p_replaces is not null then
    select * into v_prev from requests
    where id = p_replaces and employee_id = p_employee and status <> 'заменена'
    for update;
  end if;

  insert into requests (employee_id, type, start_date, end_date, substitute_id, comment, replaces_request_id)
  values (p_employee, p_type, p_start, p_end, p_substitute, nullif(trim(p_comment), ''), v_prev.id)
  returning id into v_id;

  if v_prev.id is not null then
    update requests set status = 'заменена', status_before_replace = v_prev.status where id = v_prev.id;
  end if;
  return v_id;
end $$;

revoke execute on function replaceable_request(bigint, bigint) from public;
revoke execute on function submit_request(bigint, text, date, date, bigint, text, bigint) from public;
grant execute on function replaceable_request(bigint, bigint) to anon, authenticated;
grant execute on function submit_request(bigint, text, date, date, bigint, text, bigint) to anon, authenticated;
