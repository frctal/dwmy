-- DWMY Admin Market Directory V1.1
-- Admin-only RPC write surface for canonical sections/instruments.
-- Reuses public.is_dwmy_admin() as the single authority check.

begin;

create or replace function public.admin_create_section(
  section_name text,
  section_slug text,
  section_description text default null,
  section_type_value text default 'MARKET',
  section_sort_order integer default 10
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
  normalized_type text := upper(trim(section_type_value));
begin
  if auth.uid() is null or not public.is_dwmy_admin() then
    raise exception 'DWMY admin access required';
  end if;

  if nullif(trim(section_name), '') is null then
    raise exception 'Section name is required';
  end if;

  if nullif(trim(section_slug), '') is null then
    raise exception 'Section slug is required';
  end if;

  if normalized_type not in ('MARKET', 'GENERAL', 'EDUCATION') then
    raise exception 'Invalid section type: %', section_type_value;
  end if;

  insert into public.sections (
    name, slug, description, section_type, sort_order, is_active
  )
  values (
    trim(section_name),
    trim(section_slug),
    nullif(trim(section_description), ''),
    normalized_type,
    greatest(coalesce(section_sort_order, 10), 0),
    true
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.admin_create_instrument(
  target_section_id bigint,
  instrument_symbol text,
  instrument_slug text,
  instrument_name text,
  instrument_description text default null,
  instrument_sort_order integer default 10
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  if auth.uid() is null or not public.is_dwmy_admin() then
    raise exception 'DWMY admin access required';
  end if;

  if not exists (
    select 1
    from public.sections
    where id = target_section_id
      and section_type = 'MARKET'
  ) then
    raise exception 'Target section is not a MARKET section';
  end if;

  if nullif(trim(instrument_symbol), '') is null then
    raise exception 'Instrument symbol is required';
  end if;

  if nullif(trim(instrument_slug), '') is null then
    raise exception 'Instrument slug is required';
  end if;

  if nullif(trim(instrument_name), '') is null then
    raise exception 'Instrument name is required';
  end if;

  insert into public.instruments (
    section_id, symbol, slug, name, description, sort_order, is_active
  )
  values (
    target_section_id,
    upper(trim(instrument_symbol)),
    trim(instrument_slug),
    trim(instrument_name),
    nullif(trim(instrument_description), ''),
    greatest(coalesce(instrument_sort_order, 10), 0),
    true
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.admin_set_section_active(
  target_section_id bigint,
  active_value boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_dwmy_admin() then
    raise exception 'DWMY admin access required';
  end if;

  update public.sections
  set is_active = active_value
  where id = target_section_id;

  if not found then
    raise exception 'Section not found';
  end if;
end;
$$;

create or replace function public.admin_set_instrument_active(
  target_instrument_id bigint,
  active_value boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_dwmy_admin() then
    raise exception 'DWMY admin access required';
  end if;

  update public.instruments
  set is_active = active_value
  where id = target_instrument_id;

  if not found then
    raise exception 'Instrument not found';
  end if;
end;
$$;

revoke all on function public.admin_create_section(text,text,text,text,integer) from public;
revoke all on function public.admin_create_instrument(bigint,text,text,text,text,integer) from public;
revoke all on function public.admin_set_section_active(bigint,boolean) from public;
revoke all on function public.admin_set_instrument_active(bigint,boolean) from public;

grant execute on function public.admin_create_section(text,text,text,text,integer) to authenticated;
grant execute on function public.admin_create_instrument(bigint,text,text,text,text,integer) to authenticated;
grant execute on function public.admin_set_section_active(bigint,boolean) to authenticated;
grant execute on function public.admin_set_instrument_active(bigint,boolean) to authenticated;

commit;

-- Acceptance / inspection
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_create_section',
    'admin_create_instrument',
    'admin_set_section_active',
    'admin_set_instrument_active'
  )
order by p.proname;
