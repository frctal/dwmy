-- DWMY Instrument Statistics V1
begin;

create or replace function public.get_instrument_statistics(
  target_instrument_id bigint,
  lookback_days integer default 7,
  trader_limit integer default 5
)
returns jsonb
language sql stable security definer
set search_path = public
as $$
with scoped_posts as (
  select p.author_id,p.created_at,d.id discussion_id,d.segment_type
  from public.posts p
  join public.discussions d on d.id=p.discussion_id
  where d.instrument_id=target_instrument_id
    and p.is_deleted=false and d.is_deleted=false
    and p.created_at >= now() - make_interval(days=>greatest(1,least(coalesce(lookback_days,7),36500)))
),
summary as (
  select count(*)::bigint contribution_count,
         count(distinct author_id)::bigint trader_count,
         count(distinct discussion_id)::bigint discussion_count,
         max(created_at) latest_activity_at
  from scoped_posts
),
res as (
  select count(*) filter(where segment_type='DAY')::bigint day_count,
         count(*) filter(where segment_type='WEEK')::bigint week_count,
         count(*) filter(where segment_type='MONTH')::bigint month_count,
         count(*) filter(where segment_type='YEAR')::bigint year_count
  from scoped_posts
)
select jsonb_build_object(
 'instrument_id',target_instrument_id,
 'contribution_count',s.contribution_count,'trader_count',s.trader_count,
 'discussion_count',s.discussion_count,'latest_activity_at',s.latest_activity_at,
 'resolutions',jsonb_build_object('DAY',r.day_count,'WEEK',r.week_count,'MONTH',r.month_count,'YEAR',r.year_count),
 'top_traders',coalesce((
   select jsonb_agg(x.obj order by x.contributions desc,x.username)
   from (
     select pr.username,count(*)::bigint contributions,
       jsonb_build_object('user_id',sp.author_id,'username',pr.username,'display_name',pr.display_name,'contributions',count(*)::bigint) obj
     from scoped_posts sp join public.profiles pr on pr.id=sp.author_id
     group by sp.author_id,pr.username,pr.display_name
     order by count(*) desc,pr.username
     limit greatest(1,least(coalesce(trader_limit,5),20))
   ) x
 ),'[]'::jsonb)
)
from summary s cross join res r;
$$;

revoke all on function public.get_instrument_statistics(bigint,integer,integer) from public;
grant execute on function public.get_instrument_statistics(bigint,integer,integer) to authenticated;
commit;

select public.get_instrument_statistics(1,7,5);
