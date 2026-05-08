alter table public.categories
  add column if not exists projection_method text not null default 'none'
    check (projection_method in ('none', 'historical_average')),
  add column if not exists projection_months integer not null default 3
    check (projection_months between 1 and 12);

