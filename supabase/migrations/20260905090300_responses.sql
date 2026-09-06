-- Responses and answers. Relational, unlike the definition; see DECISIONS 001.
--
-- One responses row per submission, one answers row per question answered,
-- holding the tagged answer envelope from domain/answer.ts as JSONB.

create table public.responses (
    id             uuid primary key default gen_random_uuid(),
    survey_id      uuid        not null references public.surveys (id) on delete cascade,
    -- Which definition the respondent actually saw. Set by trigger from the
    -- survey's published_version; a client-supplied value is discarded.
    survey_version int         not null,
    locale         text check (locale in ('et', 'en', 'ru')),
    submitted_at   timestamptz not null default now(),
    meta           jsonb check (meta is null or jsonb_typeof(meta) = 'object'),
    -- FK target for answers, which carries survey_id so its RLS policy need not
    -- read this table.
    unique (id, survey_id),
    foreign key (survey_id, survey_version)
        references public.survey_versions (survey_id, version)
);

comment on table public.responses is
    'One submission. Deliberately carries no session_id: survey_events must not be joinable to an individual''s answers (DECISIONS 004).';

create index responses_survey_submitted_idx on public.responses (survey_id, submitted_at desc);

-- Definer: an anonymous respondent cannot select from surveys.
create or replace function public.responses_set_version() returns trigger
    language plpgsql
    security definer
    set search_path = ''
as $$
declare
    v_version int;
begin
    select s.published_version
    into v_version
    from public.surveys s
    where s.id = new.survey_id;

    if v_version is null then
        raise exception 'survey % has no published version', new.survey_id
            using errcode = '23503';
    end if;

    new.survey_version := v_version;
    return new;
end;
$$;

create trigger responses_set_version
    before insert on public.responses
    for each row execute function public.responses_set_version();

create table public.answers (
    response_id uuid        not null,
    survey_id   uuid        not null,
    question_id uuid        not null,
    -- The tagged AnswerValue envelope. A skipped question has no row at all.
    value       jsonb       not null
                    check (jsonb_typeof(value) = 'object' and value ? 'type'),
    created_at  timestamptz not null default now(),
    primary key (response_id, question_id),
    foreign key (response_id, survey_id)
        references public.responses (id, survey_id) on delete cascade,
    -- Deferred so that deleting a survey can cascade through both this table
    -- and the question projection in either order.
    foreign key (question_id, survey_id)
        references public.survey_questions (question_id, survey_id)
        deferrable initially deferred
);

create index answers_survey_question_idx on public.answers (survey_id, question_id);

create or replace function public.answers_reject_removed_question() returns trigger
    language plpgsql
    security definer
    set search_path = ''
as $$
begin
    if exists (select 1
               from public.survey_questions q
               where q.question_id = new.question_id
                 and q.removed_at is not null) then
        raise exception 'question % is no longer part of its survey', new.question_id
            using errcode = '23514';
    end if;
    return new;
end;
$$;

create trigger answers_reject_removed_question
    before insert on public.answers
    for each row execute function public.answers_reject_removed_question();

alter table public.responses enable row level security;
alter table public.answers enable row level security;

-- The one place where a wrong policy leaks other people's data: respondents may
-- write, and only into a published survey, and may read nothing back.
create policy "responses: respondent inserts into a published survey"
    on public.responses for insert to anon, authenticated
    with check (public.survey_is_published(survey_id));

create policy "responses: owner reads"
    on public.responses for select to authenticated
    using (public.owns_survey(survey_id));

create policy "responses: owner deletes"
    on public.responses for delete to authenticated
    using (public.owns_survey(survey_id));

create policy "answers: respondent inserts into a published survey"
    on public.answers for insert to anon, authenticated
    with check (public.survey_is_published(survey_id));

create policy "answers: owner reads"
    on public.answers for select to authenticated
    using (public.owns_survey(survey_id));

create policy "answers: owner deletes"
    on public.answers for delete to authenticated
    using (public.owns_survey(survey_id));

-- No UPDATE policy on either table: a submitted response is immutable.

revoke all on table public.responses from anon, authenticated;
grant insert on table public.responses to anon, authenticated;
grant select, delete on table public.responses to authenticated;

revoke all on table public.answers from anon, authenticated;
grant insert on table public.answers to anon, authenticated;
grant select, delete on table public.answers to authenticated;
