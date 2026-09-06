-- Interaction analytics. Append-only, high-volume, disposable; see DECISIONS 004.
--
-- session_id is anonymous and per-visit, and is deliberately not stored on
-- responses, so behaviour can never be joined back to an individual's answers.
-- question_id carries no foreign key on purpose: events outlive the questions
-- they describe and must never block an edit to the definition.

create table public.survey_events (
    id          bigint generated always as identity primary key,
    survey_id   uuid        not null references public.surveys (id) on delete cascade,
    session_id  uuid        not null,
    question_id uuid,
    type        text        not null check (type in (
        'view', 'start', 'question_view', 'question_answer', 'submit', 'abandon'
    )),
    at          timestamptz not null default now(),
    meta        jsonb check (meta is null or jsonb_typeof(meta) = 'object')
);

create index survey_events_survey_at_idx on public.survey_events (survey_id, at);
create index survey_events_survey_type_idx on public.survey_events (survey_id, type);
create index survey_events_session_idx on public.survey_events (session_id);

alter table public.survey_events enable row level security;

create policy "survey_events: respondent inserts into a published survey"
    on public.survey_events for insert to anon, authenticated
    with check (public.survey_is_published(survey_id));

create policy "survey_events: owner reads"
    on public.survey_events for select to authenticated
    using (public.owns_survey(survey_id));

create policy "survey_events: owner deletes"
    on public.survey_events for delete to authenticated
    using (public.owns_survey(survey_id));

revoke all on table public.survey_events from anon, authenticated;
grant insert on table public.survey_events to anon, authenticated;
grant select, delete on table public.survey_events to authenticated;
