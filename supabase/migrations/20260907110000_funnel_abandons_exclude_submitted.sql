-- A session that abandoned and then came back and submitted is not abandoned.
--
-- `visibilitychange` fires when a phone respondent switches apps or reloads,
-- and the runner files an `abandon` there because that is the only signal a
-- phone reliably gives before the tab is discarded. The session id lives in
-- `sessionStorage` and survives both, so the same person could be counted as
-- abandoned *and* completed. The client-side guard only ever blocked an
-- abandon after a submit; it cannot block a submit after an abandon, because
-- the event is already written.
--
-- So the resolution belongs here, where the whole session is visible at once:
-- an abandon is only an abandonment if that session never submitted. This also
-- fixes the case the client can never see — two devices, a lost beacon, an
-- event that arrived out of order.
--
-- Views, starts and submits are unchanged; the query is restated per session
-- rather than per (session, type) pair so the exclusion can be expressed at
-- all, and still counts distinct sessions rather than event rows.

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
with sessions as (select e.session_id,
                         bool_or(e.type = 'view')    as viewed,
                         bool_or(e.type = 'start')   as started,
                         bool_or(e.type = 'submit')  as submitted,
                         bool_or(e.type = 'abandon') as abandoned
                  from public.survey_events e
                  where e.survey_id = p_survey_id
                    and e.type in ('view', 'start', 'submit', 'abandon')
                  group by e.session_id)
select count(*) filter (where s.viewed)                        as views,
       count(*) filter (where s.started)                       as starts,
       count(*) filter (where s.submitted)                     as submits,
       count(*) filter (where s.abandoned and not s.submitted) as abandons
from sessions s;
$$;

comment on function public.survey_funnel_totals(uuid) is
    'Survey-level funnel stages as distinct session counts. A session that submitted is never counted as abandoned. security_invoker: RLS on survey_events decides what is visible.';
