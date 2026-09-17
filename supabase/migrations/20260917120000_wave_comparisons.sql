-- Wave comparisons the owner builds. See docs/DECISIONS.md 035.
--
-- A comparison belongs to one wave group and covers two to five of its waves.
-- It is a list of rows; a row lines up at most one question per wave. Nothing
-- here infers a match — the application suggests starting rows, the owner
-- changes them, and these tables hold the result.
--
-- The one rule the schema is built around: a comparison never blocks editing
-- or deleting a survey. So every link *into* a survey or a question cascades,
-- and the question-type rule is a trigger on the comparison's own writes, not
-- a foreign key — sync_survey_questions() upserts `type`, and a key over it
-- would make a builder save fail because of a comparison.

create table public.wave_comparisons (
    id            uuid        primary key default gen_random_uuid(),
    owner_id      uuid        not null references public.profiles (id) on delete cascade,
    wave_group_id uuid        not null,
    name          text        not null
                      check (char_length(name) between 1 and 120 and name = btrim(name)),
    -- Optimistic-concurrency token for the matching editor's autosave, as
    -- surveys.version is for the builder's.
    version       int         not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.wave_comparisons is
    'A named set of question matches across waves of one wave group, built by the owner (DECISIONS 035).';

create index wave_comparisons_group_idx
    on public.wave_comparisons (wave_group_id, updated_at desc);

create trigger wave_comparisons_set_updated_at
    before update on public.wave_comparisons
    for each row execute function public.set_updated_at();

-- A survey leaving (deleted) takes only its membership with it: the comparison
-- stays, smaller, and the owner decides what to do with it.
create table public.wave_comparison_waves (
    comparison_id uuid not null references public.wave_comparisons (id) on delete cascade,
    survey_id     uuid not null references public.surveys (id) on delete cascade,
    primary key (comparison_id, survey_id)
);

create index wave_comparison_waves_survey_idx
    on public.wave_comparison_waves (survey_id);

create table public.wave_comparison_rows (
    id            uuid not null primary key,
    comparison_id uuid not null references public.wave_comparisons (id) on delete cascade,
    unique (id, comparison_id)
);

create index wave_comparison_rows_comparison_idx
    on public.wave_comparison_rows (comparison_id);

create table public.wave_comparison_matches (
    row_id        uuid not null,
    comparison_id uuid not null,
    survey_id     uuid not null,
    question_id   uuid not null,
    -- One question per wave per row, and one row per question.
    primary key (row_id, survey_id),
    unique (comparison_id, question_id),
    foreign key (row_id, comparison_id)
        references public.wave_comparison_rows (id, comparison_id) on delete cascade,
    -- Only waves the comparison covers; removing a wave removes its matches.
    foreign key (comparison_id, survey_id)
        references public.wave_comparison_waves (comparison_id, survey_id) on delete cascade,
    -- The question belongs to that wave. A question that leaves its document
    -- unanswered loses its projection row and its match with it; a tombstoned
    -- one keeps both, so its answers stay comparable.
    foreign key (question_id, survey_id)
        references public.survey_questions (question_id, survey_id) on delete cascade
);

create index wave_comparison_matches_question_idx
    on public.wave_comparison_matches (question_id, survey_id);
create index wave_comparison_matches_wave_idx
    on public.wave_comparison_matches (comparison_id, survey_id);

-- A member wave is in the comparison's wave group and belongs to its owner, and
-- a comparison covers at most five (DESIGN §7). AFTER, so the count sees every
-- row the statement wrote; the comparison row is locked first, so two writers
-- cannot each see four and both add a fifth.
create or replace function public.wave_comparison_waves_check() returns trigger
    language plpgsql
    set search_path = ''
as $$
declare
    v_owner uuid;
    v_group uuid;
begin
    select c.owner_id, c.wave_group_id
    into v_owner, v_group
    from public.wave_comparisons c
    where c.id = new.comparison_id
        for update;

    if not exists (select 1
                   from public.surveys s
                   where s.id = new.survey_id
                     and s.wave_group_id = v_group
                     and s.owner_id = v_owner) then
        raise exception 'survey % is not a wave of this comparison''s group', new.survey_id
            using errcode = '23514';
    end if;

    if (select count(*)
        from public.wave_comparison_waves w
        where w.comparison_id = new.comparison_id) > 5 then
        raise exception 'a comparison covers at most five waves'
            using errcode = '23514';
    end if;

    return null;
end;
$$;

create trigger wave_comparison_waves_check
    after insert or update on public.wave_comparison_waves
    for each row execute function public.wave_comparison_waves_check();

-- Every question in a row has the same type. The rest of the rule (an opinion
-- scale's length) lives in the definition, and is checked by the server action
-- and again when the comparison is read.
create or replace function public.wave_comparison_matches_check() returns trigger
    language plpgsql
    set search_path = ''
as $$
declare
    v_type text;
begin
    select q.type into v_type
    from public.survey_questions q
    where q.question_id = new.question_id;

    if exists (select 1
               from public.wave_comparison_matches m
                        join public.survey_questions q on q.question_id = m.question_id
               where m.row_id = new.row_id
                 and m.question_id <> new.question_id
                 and q.type <> v_type) then
        raise exception 'a row may only match questions of one type'
            using errcode = '23514';
    end if;

    return null;
end;
$$;

create trigger wave_comparison_matches_check
    after insert or update on public.wave_comparison_matches
    for each row execute function public.wave_comparison_matches_check();

-- Policy helper, a definer for the same reason owns_survey() is one.
create or replace function public.owns_comparison(p_comparison_id uuid) returns boolean
    language sql
    stable
    security definer
    set search_path = ''
as $$
select exists (select 1
               from public.wave_comparisons c
               where c.id = p_comparison_id
                 and c.owner_id = (select auth.uid()));
$$;

revoke all on function public.owns_comparison(uuid) from public;
grant execute on function public.owns_comparison(uuid) to authenticated;

alter table public.wave_comparisons enable row level security;
alter table public.wave_comparison_waves enable row level security;
alter table public.wave_comparison_rows enable row level security;
alter table public.wave_comparison_matches enable row level security;

create policy "wave_comparisons: owner reads"
    on public.wave_comparisons for select to authenticated
    using ((select auth.uid()) = owner_id);

create policy "wave_comparisons: owner inserts"
    on public.wave_comparisons for insert to authenticated
    with check ((select auth.uid()) = owner_id);

create policy "wave_comparisons: owner updates"
    on public.wave_comparisons for update to authenticated
    using ((select auth.uid()) = owner_id)
    with check ((select auth.uid()) = owner_id);

create policy "wave_comparisons: owner deletes"
    on public.wave_comparisons for delete to authenticated
    using ((select auth.uid()) = owner_id);

create policy "wave_comparison_waves: owner manages"
    on public.wave_comparison_waves for all to authenticated
    using (public.owns_comparison(comparison_id))
    with check (public.owns_comparison(comparison_id));

create policy "wave_comparison_rows: owner manages"
    on public.wave_comparison_rows for all to authenticated
    using (public.owns_comparison(comparison_id))
    with check (public.owns_comparison(comparison_id));

create policy "wave_comparison_matches: owner manages"
    on public.wave_comparison_matches for all to authenticated
    using (public.owns_comparison(comparison_id))
    with check (public.owns_comparison(comparison_id));

revoke all on table public.wave_comparisons from anon, authenticated;
revoke all on table public.wave_comparison_waves from anon, authenticated;
revoke all on table public.wave_comparison_rows from anon, authenticated;
revoke all on table public.wave_comparison_matches from anon, authenticated;
grant select, insert, update, delete on table public.wave_comparisons to authenticated;
grant select, insert, update, delete on table public.wave_comparison_waves to authenticated;
grant select, insert, update, delete on table public.wave_comparison_rows to authenticated;
grant select, insert, update, delete on table public.wave_comparison_matches to authenticated;

-- The editor's save: the whole comparison, under its version token, in one
-- transaction. Invoker, so every write above is still held to RLS.
--
-- A match whose question or wave has vanished since the editor loaded — an
-- unanswered question deleted in another tab, a survey deleted — is dropped
-- rather than refused. Refusing would fail every retry of the same document
-- and wedge the editor, which is 024's bug in a new place; and a match to
-- something that no longer exists has nothing to say anyway.
--
-- Returns the new version, or null when the comparison is not the caller's
-- (RLS makes that and "does not exist" the same). A stale version raises
-- KM409, which the repository maps to DbConflictError.
create or replace function public.save_comparison(
    p_comparison_id    uuid,
    p_expected_version int,
    p_name             text,
    p_survey_ids       uuid[],
    p_rows             jsonb
) returns int
    language plpgsql
    set search_path = ''
as $$
declare
    v_version int;
begin
    select c.version into v_version
    from public.wave_comparisons c
    where c.id = p_comparison_id
        for update;

    if not found then
        return null;
    end if;

    if v_version <> p_expected_version then
        raise exception 'comparison % is at version %, not %',
            p_comparison_id, v_version, p_expected_version
            using errcode = 'KM409';
    end if;

    update public.wave_comparisons
    set name    = p_name,
        version = version + 1
    where id = p_comparison_id
    returning version into v_version;

    delete from public.wave_comparison_rows r
    where r.comparison_id = p_comparison_id;

    delete from public.wave_comparison_waves w
    where w.comparison_id = p_comparison_id
      and not (w.survey_id = any (p_survey_ids));

    insert into public.wave_comparison_waves (comparison_id, survey_id)
    select p_comparison_id, s.id
    from public.surveys s
    where s.id = any (p_survey_ids)
    on conflict do nothing;

    with match as (select (r.value ->> 'id')::uuid           as row_id,
                          (m.value ->> 'surveyId')::uuid     as survey_id,
                          (m.value ->> 'questionId')::uuid   as question_id
                   from jsonb_array_elements(p_rows) as r(value)
                            cross join lateral jsonb_array_elements(r.value -> 'matches') as m(value)),
         surviving as (select match.*
                       from match
                       where exists (select 1
                                     from public.wave_comparison_waves w
                                     where w.comparison_id = p_comparison_id
                                       and w.survey_id = match.survey_id)
                         and exists (select 1
                                     from public.survey_questions q
                                     where q.question_id = match.question_id
                                       and q.survey_id = match.survey_id)),
         inserted_rows as (
             insert into public.wave_comparison_rows (id, comparison_id)
                 select distinct s.row_id, p_comparison_id
                 from surviving s
                 returning id)
    insert
    into public.wave_comparison_matches (row_id, comparison_id, survey_id, question_id)
    select s.row_id, p_comparison_id, s.survey_id, s.question_id
    from surviving s
             join inserted_rows i on i.id = s.row_id;

    return v_version;
end;
$$;

-- Creating is saving into an empty comparison, so there is one writer of
-- a comparison's contents rather than two that could disagree.
create or replace function public.create_comparison(
    p_wave_group_id uuid,
    p_name          text,
    p_survey_ids    uuid[],
    p_rows          jsonb
) returns uuid
    language plpgsql
    set search_path = ''
as $$
declare
    v_id uuid;
begin
    insert into public.wave_comparisons (owner_id, wave_group_id, name)
    values ((select auth.uid()), p_wave_group_id, p_name)
    returning id into v_id;

    perform public.save_comparison(v_id, 0, p_name, p_survey_ids, p_rows);
    return v_id;
end;
$$;

revoke all on function public.save_comparison(uuid, int, text, uuid[], jsonb) from public;
revoke all on function public.create_comparison(uuid, text, uuid[], jsonb) from public;
grant execute on function public.save_comparison(uuid, int, text, uuid[], jsonb) to authenticated;
grant execute on function public.create_comparison(uuid, text, uuid[], jsonb) to authenticated;

-- The definition a removed question last had. A tombstoned question (DECISIONS
-- 008) is gone from surveys.elements, but its answers were collected against a
-- published version, so the newest snapshot holding it is the wording and the
-- options those answers mean. Invoker: survey_versions' own policy decides.
create or replace function public.removed_question_definitions(p_question_ids uuid[])
    returns table
            (
                question_id uuid,
                survey_id   uuid,
                locale      text,
                element     jsonb
            )
    language sql
    stable
    set search_path = ''
as $$
select distinct on (q.question_id) q.question_id, v.survey_id, v.locale, e.value
from public.survey_questions q
         join public.survey_versions v on v.survey_id = q.survey_id
         cross join lateral jsonb_array_elements(v.elements) as e(value)
where q.question_id = any (p_question_ids)
  and q.removed_at is not null
  and e.value ->> 'id' = q.question_id::text
order by q.question_id, v.version desc;
$$;

revoke all on function public.removed_question_definitions(uuid[]) from public;
grant execute on function public.removed_question_definitions(uuid[]) to authenticated;
