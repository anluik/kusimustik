-- The runner has to tell "closed" from "never existed".
--
-- A respondent following a link to a survey that has stopped collecting should
-- be told that, not shown a 404 — and the copy for it has been in the runner
-- catalogue since Phase 3. `get_published_survey` could not express the
-- difference, so it is replaced by `get_runner_survey`, which returns a
-- published *or* closed row and leaves the branch to the caller.
--
-- Nothing about the enumeration property from DECISIONS 009 changes: the slug
-- is still the capability, `surveys` still has no anonymous SELECT policy, and
-- `owner_id` is still not projected. Submission is unaffected — the RLS policy
-- on `responses` requires `status = 'published'`, so an answer to a closed
-- survey is refused by the database whatever the runner renders.
create or replace function public.get_runner_survey(p_slug text)
    returns table
            (
                id                uuid,
                title             text,
                description       text,
                status            text,
                slug              text,
                locale            text,
                wave_group_id     uuid,
                wave_label        text,
                elements          jsonb,
                version           int,
                published_version int
            )
    language sql
    stable
    security definer
    set search_path = ''
as $$
select s.id,
       s.title,
       s.description,
       s.status,
       s.slug,
       s.locale,
       s.wave_group_id,
       s.wave_label,
       s.elements,
       s.version,
       s.published_version
from public.surveys s
where s.slug = p_slug
  and s.status in ('published', 'closed');
$$;

revoke all on function public.get_runner_survey(text) from public;
grant execute on function public.get_runner_survey(text) to anon, authenticated;

drop function if exists public.get_published_survey(text);
