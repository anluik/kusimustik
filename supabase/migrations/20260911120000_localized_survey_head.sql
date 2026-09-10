-- The survey's own title and intro become locale-keyed, like every other word
-- a respondent reads.
--
-- DECISIONS 030 left these two as plain columns and said a translated survey
-- name would be a decision of its own. It is 034, and this is it: the runner
-- puts both on the respondent's screen — the title in the sticky header and in
-- the page title, the intro above the first question — so an Estonian survey
-- read in Russian was Russian everywhere except those two places.
--
-- Unlike 20260909120000, which rewrote the *values* in `elements` and had to
-- disable the definition triggers to do it, this changes the column *type*.
-- `alter table ... alter column ... type` is DDL and fires no row-level
-- triggers at all, so surveys_before_write() does not bump `version` and
-- surveys_after_write() snapshots nothing — with no window in which the
-- triggers are off. Do not "fix" this back into a disable-and-UPDATE.

-- 1. The text limits go. They are per language now, and per language is a rule
--    only the domain schema can express; SQL keeps the shape check below, at
--    the same depth `elements` is checked at.
alter table public.surveys
    drop constraint surveys_title_check,
    drop constraint surveys_description_check;

-- 2. Every existing survey is declared to be written in its own `locale`, the
--    same claim the 20260909120000 migration made about its elements. A
--    description stored as an empty string becomes *absent* rather than an
--    empty translation, which is the rule one level down already follows.
alter table public.surveys
    alter column title type jsonb using jsonb_build_object(locale, title),
    alter column description type jsonb using
        case
            when description is null or description = '' then null
            else jsonb_build_object(locale, description)
            end;

-- The snapshots convert too. Nothing reads them today, and one left in a shape
-- the domain rejects is a landmine under whatever reads them first (030).
alter table public.survey_versions
    alter column title type jsonb using jsonb_build_object(locale, title),
    alter column description type jsonb using
        case
            when description is null or description = '' then null
            else jsonb_build_object(locale, description)
            end;

-- 3. The shape, and nothing more: `AuthoredSurveySchema` is the real validator
--    and every read is parsed through it. Text in no language at all is not a
--    translation state, it is a document nothing can render.
alter table public.surveys
    add constraint surveys_title_localized
        check (jsonb_typeof(title) = 'object' and title <> '{}'::jsonb),
    add constraint surveys_description_localized
        check (description is null
            or (jsonb_typeof(description) = 'object' and description <> '{}'::jsonb));

comment on column public.surveys.title is
    'The survey''s name, locale-keyed. Resolved through surveys.locale for the owner and through the respondent''s locale in the runner. See docs/DECISIONS.md 034.';
comment on column public.surveys.description is
    'The paragraph above the first question, locale-keyed. Absent rather than empty when nobody has written one.';

-- surveys_before_write(), surveys_after_write() and sync_survey_questions() all
-- keep working verbatim and are deliberately not recreated here:
--
--   * the definition-change test is `new.title is distinct from old.title`, and
--     jsonb has equality. It gets slightly better, in fact — jsonb normalises
--     key order on storage, so re-saving the same three translations in a
--     different order is not an edit and does not bump the version;
--   * the snapshot insert copies new.title and new.description into columns
--     that just changed type with them;
--   * the projection reads `element -> 'title'` and never the survey's own.

-- 4. The runner's read returns the maps; `getRunnerSurveyBySlug` resolves them
--    through the respondent's locale, as it already does for the elements.
--    Dropped and recreated rather than replaced — the returned row type
--    changes, which `create or replace function` will not do.
drop function if exists public.get_runner_survey(text);

create function public.get_runner_survey(p_slug text)
    returns table
            (
                id                uuid,
                title             jsonb,
                description       jsonb,
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
