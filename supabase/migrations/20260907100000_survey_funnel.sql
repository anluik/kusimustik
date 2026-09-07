-- The drop-off funnel, from survey_events. Phase 7 of docs/PLAN.md.
--
-- Two grouped queries: one for the survey-level stages (views, starts,
-- submits, abandons) and one for per-question reach and dwell. Grouping cannot
-- be expressed through PostgREST, and pulling every event row to fold it in
-- the application would ship a busy survey's whole interaction log to the
-- browser to count it.
--
-- Both are `security invoker` — the default, stated here because it is the
-- point. The RLS policy on survey_events ("owner reads") stays the enforcement
-- point, so an owner sees their own funnel and nobody else's. A definer
-- function here would hand any authenticated caller the whole instance's
-- analytics for the cost of guessing a survey id.
--
-- Counts are of *distinct sessions*, not event rows. The runner already emits
-- each type at most once per visit (and once per question), but the funnel's
-- meaning depends on that being true, so the query enforces it rather than
-- trusting the client that produced the rows.

create or replace function public.survey_funnel_totals(p_survey_id uuid)
    returns table
            (
                views    bigint,
                starts   bigint,
                submits  bigint,
                abandons bigint
            )
    language sql
    stable
    security invoker
    set search_path = ''
as $$
select count(*) filter (where s.type = 'view')    as views,
       count(*) filter (where s.type = 'start')   as starts,
       count(*) filter (where s.type = 'submit')  as submits,
       count(*) filter (where s.type = 'abandon') as abandons
from (select distinct e.session_id, e.type
      from public.survey_events e
      where e.survey_id = p_survey_id
        and e.type in ('view', 'start', 'submit', 'abandon')) s;
$$;

comment on function public.survey_funnel_totals(uuid) is
    'Survey-level funnel stages as distinct session counts. security_invoker: RLS on survey_events decides what is visible.';

-- Deliberately returns no key, title or position. Those are definition data and
-- come from surveys.elements through SurveySchema; survey_questions is an index,
-- not a source of truth (DECISIONS 002). The caller joins on question_id and
-- orders by the document.
create or replace function public.survey_question_funnel(p_survey_id uuid)
    returns table
            (
                question_id     uuid,
                reached         bigint,
                answered        bigint,
                median_dwell_ms int
            )
    language sql
    stable
    security invoker
    set search_path = ''
as $$
with reach as (select e.question_id,
                      count(distinct e.session_id)
                          filter (where e.type = 'question_view')   as reached,
                      count(distinct e.session_id)
                          filter (where e.type = 'question_answer') as answered
               from public.survey_events e
               where e.survey_id = p_survey_id
                 and e.question_id is not null
                 and e.type in ('question_view', 'question_answer')
               group by e.question_id),
     -- Dwell is measured client-side and travels in meta (DECISIONS 016), so it
     -- is untyped JSON written by a public endpoint: anything that is not a
     -- number is dropped rather than cast, which would abort the whole report.
     dwell as (select e.question_id,
                      percentile_cont(0.5) within group (
                          order by (e.meta ->> 'dwellMs')::numeric
                          ) as median_dwell_ms
               from public.survey_events e
               where e.survey_id = p_survey_id
                 and e.question_id is not null
                 and e.type = 'question_answer'
                 and jsonb_typeof(e.meta -> 'dwellMs') = 'number'
                 and (e.meta ->> 'dwellMs')::numeric >= 0
               group by e.question_id)
select r.question_id,
       r.reached,
       r.answered,
       round(d.median_dwell_ms)::int as median_dwell_ms
from reach r
         left join dwell d on d.question_id = r.question_id;
$$;

comment on function public.survey_question_funnel(uuid) is
    'Per-question reach, answers and median dwell. Returns no definition data by design; join on question_id.';

revoke all on function public.survey_funnel_totals(uuid) from public;
revoke all on function public.survey_question_funnel(uuid) from public;
grant execute on function public.survey_funnel_totals(uuid) to authenticated;
grant execute on function public.survey_question_funnel(uuid) to authenticated;
