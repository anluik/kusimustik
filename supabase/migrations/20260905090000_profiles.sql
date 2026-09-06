-- Profiles and the shared updated_at helper.
--
-- One profile row per auth user, created by a trigger on auth.users so that
-- surveys can carry a foreign key into public schema rather than into auth.

create or replace function public.set_updated_at() returns trigger
    language plpgsql
    set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

comment on function public.set_updated_at() is
    'Generic BEFORE UPDATE trigger: stamps updated_at.';

create table public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    email        text,
    display_name text check (char_length(display_name) between 1 and 200),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.profiles is
    'Public mirror of auth.users. Maintained by handle_new_user(); never written by the application.';

create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

-- Runs as the definer: auth.users is not writable by the anon/authenticated
-- roles, and profiles has no INSERT policy.
create or replace function public.handle_new_user() returns trigger
    language plpgsql
    security definer
    set search_path = ''
as $$
begin
    insert into public.profiles (id, email, display_name)
    values (
        new.id,
        new.email,
        nullif(
            coalesce(
                new.raw_user_meta_data ->> 'display_name',
                split_part(coalesce(new.email, ''), '@', 1)
            ),
            ''
        )
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create or replace function public.handle_user_email_change() returns trigger
    language plpgsql
    security definer
    set search_path = ''
as $$
begin
    update public.profiles set email = new.email where id = new.id;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create trigger on_auth_user_email_changed
    after update of email on auth.users
    for each row when (old.email is distinct from new.email)
    execute function public.handle_user_email_change();

alter table public.profiles enable row level security;

create policy "profiles: owner reads own row"
    on public.profiles for select to authenticated
    using ((select auth.uid()) = id);

create policy "profiles: owner updates own row"
    on public.profiles for update to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

-- No INSERT or DELETE policy: both follow the auth.users row.

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
