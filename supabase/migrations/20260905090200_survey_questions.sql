-- The derived question projection. See docs/DECISIONS.md 002.
--
-- Never a source of truth: definitions always come from surveys.elements via
-- SurveySchema. This table exists to be the FK target for answers.question_id,
-- to make wave comparison a `join ... using (key)`, and to make cross-survey
-- question queries cheap.

create table public.survey_questions (
    question_id uuid primary key,
    survey_id   uuid not null references public.surveys (id) on delete cascade,
    key         text not null,
    -- Mirrors domain/question.ts ELEMENT_TYPES minus `statement`. Adding a
    -- question type to the union therefore needs a migration; see DECISIONS 008.
    type        text not null check (type in (
        'single_choice', 'multi_choice', 'dropdown', 'short_text',
        'long_text', 'opinion_scale', 'nps', 'matrix_single'
    )),
    title       text not null,
    -- Index of the element within surveys.elements, so ordering matches the
    -- document. Statement blocks leave gaps.
    position    int  not null,
    -- Set when the question has left surveys.elements but answers still point
    -- at it. Live questions have null; every consumer filters on it.
    removed_at  timestamptz,
    unique (question_id, survey_id)
);

comment on table public.survey_questions is
    'Derived projection of surveys.elements, maintained by sync_survey_questions(). The application never writes it.';

create index survey_questions_survey_id_idx on public.survey_questions (survey_id);
create index survey_questions_key_idx on public.survey_questions (key);
create unique index survey_questions_live_key_idx
    on public.survey_questions (survey_id, key) where removed_at is null;

-- Definer: the table has no write policies at all. Late-binds public.answers,
-- which is created by the next migration; the first execution can only happen
-- once a survey row is written, long after both exist.
create or replace function public.sync_survey_questions() returns trigger
    language plpgsql
    security definer
    set search_path = ''
as $$
declare
    v_ids uuid[];
begin
    -- Answerable elements only: this table is the FK target for answers, so a
    -- statement block must never be able to acquire a row and be answered.
    select coalesce(array_agg((e.value ->> 'id')::uuid), '{}')
    into v_ids
    from jsonb_array_elements(new.elements) as e(value)
    where e.value ->> 'type' is distinct from 'statement';

    -- question_id is generated client-side. Letting one survey's document claim
    -- another survey's question would silently re-point that survey's answers.
    if exists (select 1
               from public.survey_questions q
               where q.question_id = any (v_ids)
                 and q.survey_id <> new.id) then
        raise exception 'question id already belongs to another survey'
            using errcode = '23505';
    end if;

    with element as (select e.value                as element,
                            (e.ordinality - 1)::int as position
                     from jsonb_array_elements(new.elements) with ordinality as e(value, ordinality)
                     where e.value ->> 'type' is distinct from 'statement')
    insert
    into public.survey_questions (question_id, survey_id, key, type, title, position, removed_at)
    select (element ->> 'id')::uuid,
           new.id,
           element ->> 'key',
           element ->> 'type',
           element ->> 'title',
           position,
           null
    from element
    on conflict (question_id) do update
        set key        = excluded.key,
            type       = excluded.type,
            title      = excluded.title,
            position   = excluded.position,
            removed_at = null;

    -- Gone from the document and never answered: drop it.
    delete
    from public.survey_questions q
    where q.survey_id = new.id
      and not (q.question_id = any (v_ids))
      and not exists (select 1 from public.answers a where a.question_id = q.question_id);

    -- Gone from the document but answered: tombstone it, so the collected
    -- responses keep a question to point at and stay exportable.
    update public.survey_questions q
    set removed_at = now()
    where q.survey_id = new.id
      and not (q.question_id = any (v_ids))
      and q.removed_at is null;

    return null;
end;
$$;

create trigger surveys_sync_questions_insert
    after insert on public.surveys
    for each row execute function public.sync_survey_questions();

create trigger surveys_sync_questions_update
    after update of elements on public.surveys
    for each row when (old.elements is distinct from new.elements)
    execute function public.sync_survey_questions();

alter table public.survey_questions enable row level security;

create policy "survey_questions: owner reads"
    on public.survey_questions for select to authenticated
    using (public.owns_survey(survey_id));

-- No write policies: the projection is trigger-maintained.

revoke all on table public.survey_questions from anon, authenticated;
grant select on table public.survey_questions to authenticated;
