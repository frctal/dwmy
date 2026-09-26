-- DWMY Post Count V1
-- Adds an authoritative contribution count to public.profiles.
-- Counts all non-deleted posts, including replies, across DWMY.
-- Keeps the count correct for inserts, soft-delete/restore, author changes,
-- and permanent deletes.

begin;

alter table public.profiles
  add column if not exists post_count bigint not null default 0;

-- Backfill from the current posts table.
update public.profiles p
set post_count = coalesce(x.post_count, 0)
from (
  select
    p2.id as profile_id,
    count(po.id)::bigint as post_count
  from public.profiles p2
  left join public.posts po
    on po.author_id = p2.id
   and po.is_deleted = false
  group by p2.id
) x
where p.id = x.profile_id;

create or replace function public.sync_profile_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- INSERT: count a newly-created visible post.
  if tg_op = 'INSERT' then
    if new.is_deleted = false then
      update public.profiles
      set post_count = post_count + 1
      where id = new.author_id;
    end if;
    return new;
  end if;

  -- DELETE: remove a permanently-deleted visible post from the count.
  if tg_op = 'DELETE' then
    if old.is_deleted = false then
      update public.profiles
      set post_count = greatest(post_count - 1, 0)
      where id = old.author_id;
    end if;
    return old;
  end if;

  -- UPDATE: handle author changes and soft-delete / restore.
  if old.author_id is distinct from new.author_id then
    if old.is_deleted = false then
      update public.profiles
      set post_count = greatest(post_count - 1, 0)
      where id = old.author_id;
    end if;

    if new.is_deleted = false then
      update public.profiles
      set post_count = post_count + 1
      where id = new.author_id;
    end if;

    return new;
  end if;

  if old.is_deleted is distinct from new.is_deleted then
    if old.is_deleted = false and new.is_deleted = true then
      update public.profiles
      set post_count = greatest(post_count - 1, 0)
      where id = new.author_id;
    elsif old.is_deleted = true and new.is_deleted = false then
      update public.profiles
      set post_count = post_count + 1
      where id = new.author_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_post_count on public.posts;

create trigger trg_sync_profile_post_count
after insert or update of author_id, is_deleted or delete
on public.posts
for each row
execute function public.sync_profile_post_count();

commit;

-- Acceptance check:
select
  p.username,
  p.post_count,
  count(po.id) filter (where po.is_deleted = false)::bigint as actual_post_count
from public.profiles p
left join public.posts po on po.author_id = p.id
group by p.id, p.username, p.post_count
order by p.post_count desc, p.username;
