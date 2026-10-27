-- Проверки при подаче заявления на стороне базы. Запустить в Supabase → SQL Editor после 008
-- (скрипт можно запускать повторно).
--
-- Форма без входа ограничивает выбор только в интерфейсе, а функцию submit_request можно вызвать
-- и в обход формы. Теперь база сама отклоняет заявление, если:
--   тип скрыт HR или его нет в справочнике;
--   заместитель не из «своих» (руководитель, коллеги, подчинённые) или это сам сотрудник;
--   начало в прошлом или конец больше чем через 2 года;
--   комментарий длиннее 1000 символов;
--   от этого сотрудника уже 5 заявлений за последний час;
--   от всех вместе уже 30 заявлений за последнюю минуту (защита от рассылки скриптом).

-- Для подсчёта лимитов без просмотра всей таблицы
create index if not exists requests_submitted_at on requests (submitted_at);
create index if not exists requests_employee_submitted_at on requests (employee_id, submitted_at);

create or replace function submit_request(
  p_employee bigint, p_type text, p_start date, p_end date,
  p_substitute bigint, p_comment text, p_token uuid
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_prev requests%rowtype;
  v_me employees%rowtype;
  v_today date := (now() at time zone 'Europe/Minsk')::date;
begin
  select * into v_me from employees where id = p_employee and active;
  if v_me.id is null then
    raise exception 'Сотрудник не найден';
  end if;

  -- Подачи выполняются по очереди, иначе одновременные запросы могли бы обойти лимиты
  perform pg_advisory_xact_lock(hashtext('submit_request'));
  if (select count(*) from requests where submitted_at > now() - interval '1 minute') >= 30 then
    raise exception 'Сейчас слишком много заявлений. Попробуйте через минуту.';
  end if;
  if (select count(*) from requests where employee_id = p_employee and submitted_at > now() - interval '1 hour') >= 5 then
    raise exception 'Вы уже подали 5 заявлений за последний час. Попробуйте позже.';
  end if;

  if not exists (select 1 from request_types where name = p_type and active) then
    raise exception 'Такого типа заявления нет';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Дата окончания раньше даты начала';
  end if;
  if p_start < v_today then
    raise exception 'Дата начала уже прошла';
  end if;
  if p_end > v_today + interval '2 years' then
    raise exception 'Заявление можно подать не больше чем на 2 года вперёд';
  end if;
  if length(p_comment) > 1000 then
    raise exception 'Комментарий длиннее 1000 символов';
  end if;

  -- «Свои» — как в списке заместителей в форме (src/domain/colleagues.ts)
  if p_substitute is not null and not exists (
    select 1 from employees s
    where s.id = p_substitute and s.active and s.id <> v_me.id
      and (
        s.id = v_me.manager_id
        or (v_me.manager_id is not null and s.manager_id = v_me.manager_id and (s.role = v_me.role or s.unit_id = v_me.unit_id))
        or s.manager_id = v_me.id
      )
  ) then
    raise exception 'Заместителем можно выбрать только руководителя, коллегу или подчинённого';
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

revoke execute on function submit_request(bigint, text, date, date, bigint, text, uuid) from public;
grant execute on function submit_request(bigint, text, date, date, bigint, text, uuid) to anon, authenticated;
