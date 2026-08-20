-- auto-populate published_at the first time a post's status becomes 'published';
-- never overwritten afterward, so unpublish/republish cycles preserve the original date.
create or replace function public.set_published_at()
returns trigger as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists posts_set_published_at on public.posts;
create trigger posts_set_published_at
  before insert or update on public.posts
  for each row execute function public.set_published_at();
