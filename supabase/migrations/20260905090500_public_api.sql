-- The two entry points the anonymous runner uses.

-- A published survey is reachable by anyone holding its link, but must not be
-- enumerable: RLS cannot require a WHERE clause, so an anon SELECT policy on
-- `surveys` would let anyone list every published survey in the instance. This
-- definer function takes the slug as the capability instead. owner_id is not
-- projected — a respondent has no business knowing who the owner is.
create or replace function public.get_published_survey(p_slug text)
    returns table
            (
                id                uuid,
                title             text,
                description       text,
                status            text,
                slug              text,
                locale            text,
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
       s.wave_group_id,
       s.wave_label,
       s.elements,
       s.version,
       s.published_version
from public.surveys s
where s.slug = p_slug
  and s.status = 'published';
$$;

-- A submission is one response plus its answers, and half of one is worthless,
-- so it goes in as a single statement. Security *invoker*: the RLS policies on
-- responses and answers stay the enforcement point, which is what makes an
-- insert against a draft survey fail here exactly as it does on the tables.
create or replace function public.submit_response(
    p_survey_id uuid,
    p_answers jsonb,
    p_locale text default null,
    p_meta jsonb default null
) returns uuid
    language plpgsql
    security invoker
    set search_path = ''
as $$
declare
    v_response_id uuid;
begin
    if jsonb_typeof(p_answers) <> 'array' then
        raise exception 'p_answers must be a json array' using errcode = '22023';
    end if;

    if exists (select 1
               from jsonb_array_elements(p_answers) as a(value)
               where a.value ->> 'question_id' is null
                  or a.value -> 'value' is null) then
        raise exception 'every answer needs a question_id and a value'
            using errcode = '22023';
    end if;

    -- The id is generated here rather than with RETURNING: RETURNING needs
    -- SELECT on the table, and an anonymous respondent must not have it.
    v_response_id := gen_random_uuid();

    insert into public.responses (id, survey_id, locale, meta)
    values (v_response_id, p_survey_id, p_locale, p_meta);

    insert into public.answers (response_id, survey_id, question_id, value)
    select v_response_id,
           p_survey_id,
           (a.value ->> 'question_id')::uuid,
           a.value -> 'value'
    from jsonb_array_elements(p_answers) as a(value);

    return v_response_id;
end;
$$;

revoke all on function public.get_published_survey(text) from public;
revoke all on function public.submit_response(uuid, jsonb, text, jsonb) from public;
grant execute on function public.get_published_survey(text) to anon, authenticated;
grant execute on function public.submit_response(uuid, jsonb, text, jsonb) to anon, authenticated;
