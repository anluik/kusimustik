-- Surveys and their published version snapshots.
--
-- The definition itself is the validated JSONB `elements` column; see
-- docs/DECISIONS.md 001. `version` is a derived revision counter used both for
-- optimistic concurrency on the builder's autosave and as the key of the
-- snapshot a response was submitted against.

create table public.surveys (
    id                uuid primary key default gen_random_uuid(),
    owner_id          uuid        not null references public.profiles (id) on delete cascade,
    title             text        not null check (char_length(title) between 1 and 300),
    description       text check (char_length(description) <= 2000),
    status            text        not null default 'draft'
                          check (status in ('draft', 'published', 'closed')),
    slug              text unique check (
                          char_length(slug) between 3 and 80
                          and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                      ),
    locale            text        not null default 'et' check (locale in ('et', 'en', 'ru')),
    -- Shared by every wave of the same recurring survey; see DECISIONS 003.
    wave_group_id     uuid        not null default gen_random_uuid(),
    wave_label        text check (char_length(wave_label) between 1 and 100),
    elements          jsonb       not null default '[]'::jsonb
                          check (jsonb_typeof(elements) = 'array'),
    -- Derived by surveys_before_write(); never written by the application.
    version           int         not null default 1,
    -- The version currently served to respondents, null while never published.
    published_version int,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    published_at      timestamptz,
    closed_at         timestamptz,
    constraint surveys_published_needs_slug
        check (status <> 'published' or slug is not null),
    constraint surveys_published_needs_version
        check (status = 'draft' or published_version is not null)
);

comment on column public.surveys.version is
    'Bumped whenever the definition (title, description, locale, elements) changes. Optimistic concurrency token.';
comment on column public.surveys.published_version is
    'survey_versions.version currently live. Equals version while published.';

create index surveys_owner_id_idx on public.surveys (owner_id);
create index surveys_owner_updated_idx on public.surveys (owner_id, updated_at desc);
create index surveys_wave_group_id_idx on public.surveys (wave_group_id);
create index surveys_wave_label_idx on public.surveys (wave_label);

-- An immutable snapshot of the definition as served to respondents. Owners edit
-- published surveys, so a response has to be able to say which wording it was
-- answering; see DECISIONS 001.
create table public.survey_versions (
    survey_id   uuid        not null references public.surveys (id) on delete cascade,
    version     int         not null,
    title       text        not null,
    description text,
    locale      text        not null,
    elements    jsonb       not null check (jsonb_typeof(elements) = 'array'),
    created_at  timestamptz not null default now(),
    primary key (survey_id, version)
);

-- Deferred: surveys_after_write() writes the snapshot after the row that points
-- at it, within the same transaction.
alter table public.surveys
    add constraint surveys_published_version_fkey
        foreign key (id, published_version)
            references public.survey_versions (survey_id, version)
            deferrable initially deferred;

create or replace function public.surveys_before_write() returns trigger
    language plpgsql
    set search_path = ''
as $$
declare
    v_definition_changed boolean;
begin
    new.updated_at := now();

    if tg_op = 'INSERT' then
        new.version := 1;
    else
        v_definition_changed :=
            new.elements is distinct from old.elements
                or new.title is distinct from old.title
                or new.description is distinct from old.description
                or new.locale is distinct from old.locale;
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

-- Definer: survey_versions has no INSERT policy, the projection is derived
-- state and the application must never write it directly.
create or replace function public.surveys_after_write() returns trigger
    language plpgsql
    security definer
    set search_path = ''
as $$
begin
    -- Only while the live version *is* the current definition. A closed survey
    -- that gets edited afterwards must not rewrite the snapshot its responses
    -- were submitted against.
    if new.published_version is not null and new.published_version = new.version then
        insert into public.survey_versions (survey_id, version, title, description, locale, elements)
        values (new.id, new.version, new.title, new.description, new.locale, new.elements)
        on conflict (survey_id, version) do update
            set title       = excluded.title,
                description = excluded.description,
                locale      = excluded.locale,
                elements    = excluded.elements;
    end if;
    return null;
end;
$$;

create trigger surveys_before_write
    before insert or update on public.surveys
    for each row execute function public.surveys_before_write();

create trigger surveys_after_write
    after insert or update on public.surveys
    for each row execute function public.surveys_after_write();

-- Policy helpers. Both are definer functions so that a policy on a child table
-- can consult `surveys` without the caller needing to be able to select from
-- it — an anonymous respondent can read neither table.
create or replace function public.owns_survey(p_survey_id uuid) returns boolean
    language sql
    stable
    security definer
    set search_path = ''
as $$
select exists (select 1
               from public.surveys s
               where s.id = p_survey_id
                 and s.owner_id = (select auth.uid()));
$$;

create or replace function public.survey_is_published(p_survey_id uuid) returns boolean
    language sql
    stable
    security definer
    set search_path = ''
as $$
select exists (select 1
               from public.surveys s
               where s.id = p_survey_id
                 and s.status = 'published');
$$;

revoke all on function public.owns_survey(uuid) from public;
revoke all on function public.survey_is_published(uuid) from public;
grant execute on function public.owns_survey(uuid) to authenticated;
grant execute on function public.survey_is_published(uuid) to anon, authenticated;

alter table public.surveys enable row level security;
alter table public.survey_versions enable row level security;

create policy "surveys: owner reads"
    on public.surveys for select to authenticated
    using ((select auth.uid()) = owner_id);

create policy "surveys: owner inserts"
    on public.surveys for insert to authenticated
    with check ((select auth.uid()) = owner_id);

create policy "surveys: owner updates"
    on public.surveys for update to authenticated
    using ((select auth.uid()) = owner_id)
    with check ((select auth.uid()) = owner_id);

create policy "surveys: owner deletes"
    on public.surveys for delete to authenticated
    using ((select auth.uid()) = owner_id);

-- Respondents never select from surveys: a policy cannot require a WHERE
-- clause, so an anon SELECT policy on published rows would let anyone list
-- every published survey in the instance. The runner goes through
-- get_published_survey(slug) instead.

create policy "survey_versions: owner reads"
    on public.survey_versions for select to authenticated
    using (public.owns_survey(survey_id));

revoke all on table public.surveys from anon, authenticated;
grant select, insert, update, delete on table public.surveys to authenticated;

revoke all on table public.survey_versions from anon, authenticated;
grant select on table public.survey_versions to authenticated;
