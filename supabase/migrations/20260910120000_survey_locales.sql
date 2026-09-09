-- The languages a survey is offered in.
--
-- Phase 12 step 1 gave every word in `elements` a locale-keyed map; this is the
-- set of languages that map is *meant* to have entries for. It cannot be
-- derived from the document, because an author has to pick a language before
-- they have written a word of it, and because a half-finished translation is
-- still a language the survey is offered in — it simply falls back per field.
-- See docs/DECISIONS.md 031.
--
-- `locale` keeps its meaning unchanged: the language the survey is authored in
-- and the fallback everything resolves through. It is always a member of
-- `locales`, which is what makes the backfill below the identity for every
-- survey that exists today.

alter table public.surveys
    add column locales text[] not null default '{}';

alter table public.survey_versions
    add column locales text[] not null default '{}';

update public.surveys set locales = array [locale];
update public.survey_versions set locales = array [locale];

comment on column public.surveys.locales is
    'Languages the survey is offered in. Normalised by surveys_before_write(): canonical order, no duplicates, always contains locale.';

alter table public.surveys
    add constraint surveys_locales_supported
        check (locales <@ array ['et', 'en', 'ru']::text[]),
    add constraint surveys_locales_not_empty
        check (cardinality(locales) >= 1),
    add constraint surveys_locales_include_locale
        check (locale = any (locales));

-- Two changes, both of them about `locales`:
--
--   * it is normalised here rather than validated, so an insert that says
--     nothing about languages — the seed, a test, `createSurvey` before the
--     settings dialog has ever been opened — gets `array[locale]` rather than
--     a constraint violation, and no caller can store a set in an order the
--     domain schema rejects;
--   * it counts as a definition change, because it decides which languages a
--     respondent may pick and therefore what the public link serves.
create or replace function public.surveys_before_write() returns trigger
    language plpgsql
    set search_path = ''
as $$
declare
    v_definition_changed boolean;
begin
    new.updated_at := now();

    -- Canonical order, no duplicates, and the authoring language is never
    -- missing from it. `array['et', 'en', 'ru']` is LOCALES, in LOCALES order.
    new.locales := array(select l
                         from unnest(array ['et', 'en', 'ru']) as l
                         where l = any (coalesce(new.locales, '{}'::text[]))
                            or l = new.locale);

    if tg_op = 'INSERT' then
        new.version := 1;
    else
        v_definition_changed :=
            new.elements is distinct from old.elements
                or new.title is distinct from old.title
                or new.description is distinct from old.description
                or new.locale is distinct from old.locale
                or new.locales is distinct from old.locales;
        -- Derived, so a client-supplied value is always discarded.
        new.version := old.version + (case when v_definition_changed then 1 else 0 end);
        new.created_at := old.created_at;

        if new.status = 'closed' and old.status is distinct from 'closed' then
            new.closed_at := now();
        end if;
    end if;

    -- A live survey always serves its newest definition, so every edit while
    -- published becomes the published version.
    if new.status = 'published' then
        new.published_version := new.version;
        new.published_at := coalesce(new.published_at, now());
    end if;

    return new;
end;
$$;

-- The snapshot carries the languages it was published in, for the same reason
-- it carries the wording: a respondent's picker is part of what they were
-- served.
create or replace function public.surveys_after_write() returns trigger
    language plpgsql
    security definer
    set search_path = ''
as $$
begin
    if new.published_version is not null and new.published_version = new.version then
        insert into public.survey_versions (survey_id, version, title, description, locale, locales, elements)
        values (new.id, new.version, new.title, new.description, new.locale, new.locales, new.elements)
        on conflict (survey_id, version) do update
            set title       = excluded.title,
                description = excluded.description,
                locale      = excluded.locale,
                locales     = excluded.locales,
                elements    = excluded.elements;
    end if;
    return null;
end;
$$;

-- The runner's read grows the column too: `AuthoredSurveySchema` parses what
-- comes back, and a survey without its languages is not a survey the domain
-- accepts. The picker that uses it lands in step 3; nothing below this reads
-- it yet. Dropped and recreated rather than replaced — the returned row type
-- changes, which `create or replace function` will not do.
drop function if exists public.get_runner_survey(text);

create function public.get_runner_survey(p_slug text)
    returns table
            (
                id                uuid,
                title             text,
                description       text,
                status            text,
                slug              text,
                locale            text,
                locales           text[],
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
       s.locales,
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
