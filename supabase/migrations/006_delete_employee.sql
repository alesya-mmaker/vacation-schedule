-- Удаление сотрудника вместе с его данными. Запустить в Supabase → SQL Editor после 005
-- (скрипт можно запускать повторно).
--
-- При удалении сотрудника база сама:
--   удаляет его заявки (а с ними — результаты проверок) и сообщения ему;
--   в чужих заявках, где он заместитель, ставит «заместитель не указан»;
--   у подчинённых очищает поле «руководитель».

alter table requests drop constraint if exists requests_employee_id_fkey;
alter table requests add constraint requests_employee_id_fkey
  foreign key (employee_id) references employees(id) on delete cascade;

alter table requests drop constraint if exists requests_substitute_id_fkey;
alter table requests add constraint requests_substitute_id_fkey
  foreign key (substitute_id) references employees(id) on delete set null;

alter table requests drop constraint if exists requests_replaces_request_id_fkey;
alter table requests add constraint requests_replaces_request_id_fkey
  foreign key (replaces_request_id) references requests(id) on delete set null;

alter table employees drop constraint if exists employees_manager_id_fkey;
alter table employees add constraint employees_manager_id_fkey
  foreign key (manager_id) references employees(id) on delete set null;

alter table outbox drop constraint if exists outbox_employee_id_fkey;
alter table outbox add constraint outbox_employee_id_fkey
  foreign key (employee_id) references employees(id) on delete cascade;

alter table outbox drop constraint if exists outbox_request_id_fkey;
alter table outbox add constraint outbox_request_id_fkey
  foreign key (request_id) references requests(id) on delete cascade;
