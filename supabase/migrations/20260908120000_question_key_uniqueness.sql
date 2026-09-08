-- A question key belongs to one question, for the life of the survey.
--
-- Two things were wrong with the projection built in 20260905090200.
--
-- 1. `sync_survey_questions()` inserted the arriving rows *before* it removed
--    the departed ones, so any single write in which a key moved from one
--    question_id to another tripped the unique index — even when the row it
--    collided with was about to be deleted in the same trigger. The builder
--    reaches that in one gesture: delete a question and add another inside the
--    700ms autosave debounce and both carry the default title, so both derive
--    `uus_kusimus`. The save failed, and every retry re-sent the same document
--    and failed identically, wedging the builder until the owner hand-edited a
--    key. The statements below are reordered: depart, then arrive.
--
-- 2. Uniqueness was enforced only over live rows (`where removed_at is null`),
--    so a key freed by deleting an *answered* question could be handed to a new
--    question on a later save. That left one survey holding two questions on
--    one key — a tombstone carrying the real answers and a live newcomer — and
--    DECISIONS 003 has wave comparison joining on exactly that key. The index
--    is now total: a tombstone keeps its key, and the builder mints `linn_2`
--    for the newcomer (see `takenKeys`).

-- Nothing has ever been able to create such a pair except through fix 2's gap,
-- and a duplicate would block the index below. Fail loudly with the survey in
-- hand rather than half-applying: there is no safe automatic answer, because
-- renaming either row silently rewrites a CSV column header and a comparison
-- join that someone may already be reading.
do $$
declare v_survey uuid;
begin
    select survey_id into v_survey
    from public.survey_questions
    group by survey_id, key having count(*) > 1
    limit 1;

    if v_survey is not null then
        raise exception
            'survey % has two questions on one key; resolve before migrating', v_survey;
    end if;
end $$;

drop index public.survey_questions_live_key_idx;

create unique index survey_questions_survey_key_idx
    on public.survey_questions (survey_id, key);

comment on index public.survey_questions_survey_key_idx is
    'A key identifies one question within a survey for the survey''s lifetime, tombstones included: wave comparison and CSV columns join on it (DECISIONS 003).';

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

    -- Gone from the document and never answered: drop it. First, so that a key
    -- it was holding is free for whichever element claims it in this same
    -- write.
    delete
    from public.survey_questions q
    where q.survey_id = new.id
      and not (q.question_id = any (v_ids))
      and not exists (select 1 from public.answers a where a.question_id = q.question_id);

    -- Gone from the document but answered: tombstone it, so the collected
    -- responses keep a question to point at and stay exportable. It keeps its
    -- key, which is therefore *not* free — that is what survey_questions_survey_key_idx
    -- now enforces.
    update public.survey_questions q
    set removed_at = now()
    where q.survey_id = new.id
      and not (q.question_id = any (v_ids))
      and q.removed_at is null;

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

    return null;
end;
$$;
