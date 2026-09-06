-- Per-survey counts for the survey list.
--
-- The list needs a response count and a question count next to every row.
-- Neither is derivable from `surveys`: responses are relational (DECISIONS 001)
-- and the question count is the live rows of the projection (DECISIONS 008,
-- which excludes statements and tombstones removed questions). Doing it in the
-- client would mean shipping every response row to count it.
--
-- `security_invoker` is the whole point: the view carries no privileges of its
-- own, so the RLS policies on surveys, responses and survey_questions remain
-- the enforcement point and an owner sees exactly their own rows. A definer
-- view here would hand every owner the whole instance's counts.

create view public.survey_stats
    with (security_invoker = on) as
select s.id                                       as survey_id,
       (select count(*)
        from public.responses r
        where r.survey_id = s.id)                 as response_count,
       -- Live questions only: a tombstoned row is a question the owner has
       -- already removed and must not be counted in "8 questions".
       (select count(*)
        from public.survey_questions q
        where q.survey_id = s.id
          and q.removed_at is null)               as question_count
from public.surveys s;

comment on view public.survey_stats is
    'Response and live-question counts per survey. security_invoker, so RLS on the underlying tables applies.';

revoke all on public.survey_stats from anon, authenticated;
grant select on public.survey_stats to authenticated;
