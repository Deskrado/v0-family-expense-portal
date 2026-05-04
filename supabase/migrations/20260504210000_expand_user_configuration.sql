alter table public.profiles add column if not exists phone text;

alter table public.user_settings add column if not exists default_payment_method text check (default_payment_method is null or default_payment_method in ('cash', 'debit', 'credit', 'transfer'));
alter table public.user_settings add column if not exists default_transaction_type text not null default 'expense' check (default_transaction_type in ('expense', 'income'));
alter table public.user_settings add column if not exists dashboard_months_ahead integer not null default 6 check (dashboard_months_ahead between 1 and 24);
alter table public.user_settings add column if not exists week_starts_on integer not null default 1 check (week_starts_on between 0 and 6);
alter table public.user_settings add column if not exists date_format text not null default 'dd/MM/yyyy';
alter table public.user_settings add column if not exists number_format text not null default 'es-AR';
alter table public.user_settings add column if not exists compact_mode boolean not null default false;
alter table public.user_settings add column if not exists show_archived boolean not null default false;
alter table public.user_settings add column if not exists notify_card_due_days integer not null default 3 check (notify_card_due_days between 0 and 31);
alter table public.user_settings add column if not exists notify_budget_threshold numeric(5,2) not null default 80 check (notify_budget_threshold between 0 and 100);
alter table public.user_settings add column if not exists auto_create_card_transactions boolean not null default false;

alter table public.families add column if not exists description text;
