-- Every word in surveys.elements becomes a locale-keyed map.
--
-- Phase 12 step 1. A title that was "Kui rahul olete?" is now
-- {"et": "Kui rahul olete?"}, and the same goes for descriptions, choice and
-- matrix labels, the "other" label, the scale endpoints and the placeholders.
-- The survey's own locale is the language every existing document is declared
-- to be in, which is what it has always claimed to be. See DECISIONS 030.
--
-- Nothing an owner or a respondent sees changes: the reader resolves the map
-- back through the survey's locale, and a map with one entry resolves to that
-- entry. What changes is that a second entry is now expressible.
--
-- Done here rather than later on purpose. The cost of this migration grows
-- with every survey in production, and it is cheapest today.

-- The reader's fallback, in SQL, mirroring `resolveText` in domain/content.ts:
-- the language asked for, then whatever the author has actually written, in
-- LOCALES order. Only the trigger below needs it — the application resolves in
-- TypeScript — but the projection is derived in the database and has to agree.
create function public.localized_text(p_text jsonb, p_locale text)
    returns text
    language sql
    immutable
    set search_path = ''
as $$
    select coalesce(
        p_text ->> p_locale,
        p_text ->> 'et',
        p_text ->> 'en',
        p_text ->> 'ru'
    );
$$;

comment on function public.localized_text(jsonb, text) is
    'One language out of a LocalizedText map, falling back the way domain/content.ts resolveText() does.';

-- One-shot conversion, dropped at the end of this migration. A document that
-- has already been converted passes through untouched, so the update below is
-- safe to have been interrupted.
create function pg_temp.localize_text(p_value jsonb, p_locale text)
    returns jsonb
    language sql
    immutable
as $$
    select case
        when jsonb_typeof(p_value) = 'string'
            then jsonb_build_object(p_locale, p_value #>> '{}')
        else p_value
    end;
$$;

create function pg_temp.localize_element(p_element jsonb, p_locale text)
    returns jsonb
    language plpgsql
    immutable
as $$
declare
    v_element jsonb := p_element;
    v_field   text;
begin
    -- The scalar text fields, across all nine element types. An optional one
    -- that was stored as an empty string becomes *absent* rather than a map
    -- holding nothing: text nobody wrote is not a translation, and the domain
    -- rejects an empty entry.
    foreach v_field in array array[
        'title', 'description', 'otherLabel', 'minLabel', 'maxLabel', 'placeholder'
    ] loop
        if v_element ? v_field then
            if jsonb_typeof(v_element -> v_field) = 'string'
                and v_element ->> v_field = '' then
                v_element := v_element - v_field;
            else
                v_element := jsonb_set(
                    v_element,
                    array[v_field],
                    pg_temp.localize_text(v_element -> v_field, p_locale)
                );
            end if;
        end if;
    end loop;

    -- The option lists: a choice's `value` is machine-facing and is left
    -- alone, its `label` is not. Order is the author's and is preserved.
    foreach v_field in array array['options', 'rows', 'columns'] loop
        if v_element ? v_field then
            v_element := jsonb_set(v_element, array[v_field], coalesce((
                select jsonb_agg(
                           case
                               when o.value ? 'label' then jsonb_set(
                                   o.value,
                                   '{label}',
                                   pg_temp.localize_text(o.value -> 'label', p_locale))
                               else o.value
                           end
                           order by o.ordinality)
                from jsonb_array_elements(v_element -> v_field)
                         with ordinality as o(value, ordinality)
            ), '[]'::jsonb));
        end if;
    end loop;

    return v_element;
end;
$$;

-- The definition triggers stay out of this. `surveys_before_write()` would
-- bump every survey's version — invalidating open builders and, for a
-- published survey, snapshotting a new survey_versions row that no response
-- points at — and `sync_survey_questions()` would rewrite a projection whose
-- titles this migration does not change: the same words resolve out of the map
-- as went into it.
alter table public.surveys disable trigger user;

update public.surveys s
set elements = coalesce((
    select jsonb_agg(pg_temp.localize_element(e.value, s.locale)
                     order by e.ordinality)
    from jsonb_array_elements(s.elements) with ordinality as e(value, ordinality)
), '[]'::jsonb)
where jsonb_array_length(s.elements) > 0;

alter table public.surveys enable trigger user;

-- The snapshots a submitted response points at. Nothing reads them today, but
-- a snapshot in a shape the domain rejects is a landmine under whatever reads
-- them first.
update public.survey_versions v
set elements = coalesce((
    select jsonb_agg(pg_temp.localize_element(e.value, v.locale)
                     order by e.ordinality)
    from jsonb_array_elements(v.elements) with ordinality as e(value, ordinality)
), '[]'::jsonb)
where jsonb_array_length(v.elements) > 0;

drop function pg_temp.localize_element(jsonb, text);
drop function pg_temp.localize_text(jsonb, text);

-- The projection carries one language: the survey's own. It is an index and a
-- foreign-key target (DECISIONS 002), not a source of definitions, so the one
-- string it holds is the one an owner sees in their own app.
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
           public.localized_text(element -> 'title', new.locale),
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

-- The locale now decides which of a question's titles the projection holds, so
-- changing it has to re-derive them. It could not matter before: there was one
-- title and the locale only named the language it was written in.
drop trigger surveys_sync_questions_update on public.surveys;

create trigger surveys_sync_questions_update
    after update of elements, locale on public.surveys
    for each row when (old.elements is distinct from new.elements
                           or old.locale is distinct from new.locale)
    execute function public.sync_survey_questions();
