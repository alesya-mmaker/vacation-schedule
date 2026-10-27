-- Ссылка на корректировку по случайному коду вместо номеров сотрудника и заявки.
-- Было: /form?employee=11&replaces=10 (номера идут подряд, их можно подобрать).
-- Стало: /form?t=<случайный код заявки>. По коду база сама находит сотрудника и заявку.
-- Запустить в Supabase → SQL Editor после 003 (скрипт можно запускать повторно).

alter table requests add column if not exists correction_token uuid not null unique default gen_random_uuid();

-- Тестовые данные: код у отклонённой и заменённой заявки №10 и ссылка в её сообщении
update requests set correction_token = '5b0c2e8a-3f6d-4c1e-9a7b-2d4e6f8a1c03' where id = 10 and employee_id = 11;
update outbox set text = replace(text, '/form?employee=11&replaces=10', '/form?t=5b0c2e8a-3f6d-4c1e-9a7b-2d4e6f8a1c03') where request_id = 10;

-- Код у заявки — служебное поле, сотруднику без входа недоступен (видит только HR)

drop function if exists replaceable_request(bigint, bigint);
drop function if exists submit_request(bigint, text, date, date, bigint, text, bigint);
drop function if exists submit_request(bigint, text, date, date, bigint, text, uuid);

-- Форма: по коду из ссылки — кто подаёт и какие были даты (если заявление ещё не заменено)
create or replace function correction_request(p_token uuid)
returns table (employee_id bigint, start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select r.employee_id, r.start_date, r.end_date
  from requests r join employees e on e.id = r.employee_id
  where r.correction_token = p_token and r.status <> 'заменена' and e.active
$$;

-- Форма: подать заявление. С кодом из ссылки — это корректировка: прежняя заявка становится
-- «заменена», а её прежний статус сохраняется (нужен правилу о переносе согласованного отпуска).
create or replace function submit_request(
  p_employee bigint, p_type text, p_start date, p_end date,
  p_substitute bigint, p_comment text, p_token uuid
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_prev requests%rowtype;
begin
  if not exists (select 1 from employees where id = p_employee and active) then
    raise exception 'Сотрудник не найден';
  end if;
  if p_token is not null then
    select * into v_prev from requests
    where correction_token = p_token and employee_id = p_employee and status <> 'заменена'
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

revoke execute on function correction_request(uuid) from public;
revoke execute on function submit_request(bigint, text, date, date, bigint, text, uuid) from public;
grant execute on function correction_request(uuid) to anon, authenticated;
grant execute on function submit_request(bigint, text, date, date, bigint, text, uuid) to anon, authenticated;
