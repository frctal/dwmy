-- DWMY Admin Market Directory V1
-- No schema mutation is required for the frontend conversion.
-- This acceptance query verifies the live canonical directory after Admin writes.

select
    s.id,
    s.name,
    s.slug,
    s.section_type,
    s.is_active,
    s.sort_order,
    count(i.id) as total_instruments,
    count(i.id) filter (where i.is_active = true) as active_instruments
from public.sections s
left join public.instruments i
    on i.section_id = s.id
group by
    s.id, s.name, s.slug, s.section_type, s.is_active, s.sort_order
order by
    s.sort_order, s.name;
