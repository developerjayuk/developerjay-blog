-- full-text search over title + content, weighted so title matches rank above body matches
alter table public.posts
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', content), 'B')
  ) stored;

create index if not exists posts_search_vector_gin_idx on public.posts using gin (search_vector);
