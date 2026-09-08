-- Phase 9: a rate limiter for the two anonymous write paths.
--
-- It lives in Postgres because that is the only shared memory a serverless
-- deployment has — no invocation shares state with the next — and because the
-- database is already the trust boundary every other anonymous write goes
-- through. The shape is the one DECISIONS 009 established: a `security
-- definer` function over a table nobody else can reach.
--
-- **The key is a salted hash, and that is a privacy decision.** DECISIONS 004
-- kept `session_id` off `responses` so that behaviour could never be joined
-- back to an individual's answers; a table of raw IPs beside `responses` is
-- exactly the join that would undo it, and under GDPR it is personal data we
-- have no reason to hold. What is stored is a SHA-256 of the salt, the bucket,
-- the scope and the caller's address together, under a salt that rotates every
-- hour and rows that are pruned within it. Nobody should later "simplify" this
-- back to an IP column: the hash is the point, and the rotation is what stops
-- it becoming a stable pseudonymous identifier.
--
-- Folding the bucket and the scope into the digest rather than keeping them as
-- columns is the same argument taken one step further. With a single opaque
-- key there is no dimension left to correlate on: even someone holding the
-- current salt cannot tell that one address answered two different surveys.

create table public.rate_limit_salts (
    -- The hour the salt belongs to; `consume_rate_limit` always uses the
    -- current one.
    period_start timestamptz primary key,
    -- 32 bytes, from two random UUIDs run through SHA-256. Deliberately not
    -- `gen_random_bytes`, which would pull in pgcrypto for one call.
    salt         bytea not null
);

create table public.rate_limit_hits (
    -- sha256(salt || bucket || scope || client). Opaque and unjoinable.
    subject      bytea       not null,
    -- Fixed windows: the counter resets on the boundary rather than sliding.
    window_start timestamptz not null,
    hits         integer     not null default 0,
    primary key (subject, window_start)
);

create index rate_limit_hits_window_idx on public.rate_limit_hits (window_start);

-- Neither table has a policy, and neither is granted to anybody. RLS with no
-- policy denies every row to every role; the only way in is the definer
-- function below, which is what keeps the salt out of reach of the anonymous
-- client that triggers the hashing.
alter table public.rate_limit_salts enable row level security;
alter table public.rate_limit_hits enable row level security;

revoke all on table public.rate_limit_salts from anon, authenticated;
revoke all on table public.rate_limit_hits from anon, authenticated;

-- Short TTL, per DECISIONS 025. A counter row is only ever read for the window
-- it names, so anything older than the longest window is already garbage; two
-- hours of salts covers a window that started just before a rotation.
create or replace function public.prune_rate_limits() returns void
    language sql
    security definer
    set search_path = ''
as $$
delete from public.rate_limit_hits where window_start < now() - interval '1 hour';
delete from public.rate_limit_salts where period_start < now() - interval '2 hours';
$$;

-- Counts one request against a bucket and says whether it is allowed.
--
-- The limits are *here*, not in the arguments. This function is granted to
-- `anon`, so a caller-supplied threshold would be a limiter anyone could
-- switch off. What the caller does supply is the bucket, the scope (which
-- survey) and its own view of the client's address.
--
-- It guards *our* endpoints — `submitResponseAction` and `/api/events` — and
-- is not a substitute for RLS: `submit_response` and the insert policies on
-- `responses` and `survey_events` remain the enforcement point, and PostgREST
-- is reachable with the publishable key whatever this returns. Closing that is
-- an edge concern, not a database one.
create or replace function public.consume_rate_limit(
    p_bucket text,
    p_scope text,
    p_client text
) returns boolean
    language plpgsql
    security definer
    set search_path = ''
as $$
declare
    v_limit        integer;
    v_window       integer;
    v_period       timestamptz;
    v_salt         bytea;
    v_window_start timestamptz;
    v_subject      bytea;
    v_hits         integer;
begin
    -- Generous on purpose. A school class or an office answers from one NAT
    -- address, and DESIGN §10 makes the respondent the surface that must never
    -- be told no; blocking thirty genuine people to slow one script down would
    -- be the wrong trade. Turnstile is what we reach for if abuse actually
    -- appears (DECISIONS 025), not a tighter number here.
    case p_bucket
        when 'submit' then
            v_limit := 30;
            v_window := 300;
        when 'events' then
            v_limit := 120;
            v_window := 60;
        else
            raise exception 'unknown rate limit bucket %', p_bucket
                using errcode = '22023';
    end case;

    if p_client is null or p_client = '' or length(p_client) > 100 then
        raise exception 'p_client must be a short non-empty identifier'
            using errcode = '22023';
    end if;
    if p_scope is null or length(p_scope) > 100 then
        raise exception 'p_scope must be at most 100 characters'
            using errcode = '22023';
    end if;

    v_window_start := to_timestamp(
        (floor(extract(epoch from now()) / v_window) * v_window)::double precision);

    -- The salt is chosen by the *window*, not by the clock. Both windows above
    -- divide an hour exactly, so a window never straddles a rotation, and a
    -- counter therefore cannot reset halfway through because the salt changed
    -- underneath it.
    v_period := date_trunc('hour', v_window_start);

    insert into public.rate_limit_salts (period_start, salt)
    values (v_period,
            sha256(convert_to(
                gen_random_uuid()::text || gen_random_uuid()::text, 'utf8')))
    on conflict (period_start) do nothing;

    select s.salt into v_salt
    from public.rate_limit_salts s
    where s.period_start = v_period;

    v_subject := sha256(
        v_salt || convert_to(p_bucket || ':' || p_scope || ':' || p_client, 'utf8'));

    insert into public.rate_limit_hits (subject, window_start, hits)
    values (v_subject, v_window_start, 1)
    on conflict (subject, window_start)
        do update set hits = rate_limit_hits.hits + 1
    returning hits into v_hits;

    -- Swept from the calls themselves rather than from a schedule: there is no
    -- cron in the local stack, the sweep is one indexed delete, and one call in
    -- fifty is often enough to keep a table whose rows live an hour bounded.
    -- `prune_rate_limits` is callable on its own if a schedule ever wants it.
    if random() < 0.02 then
        perform public.prune_rate_limits();
    end if;

    -- A caller over the threshold still counts: hammering the limiter should
    -- keep the window hot rather than let it drain while the requests continue.
    return v_hits <= v_limit;
end;
$$;

-- Supabase's default privileges grant EXECUTE on every new function in this
-- schema to anon and authenticated, so `revoke ... from public` alone leaves
-- both able to call it. The sweep is revoked by name: it is harmless (it only
-- deletes rows nothing can read any more) but there is no reason for an
-- anonymous caller to be able to make the database do deletes on request.
revoke all on function public.prune_rate_limits() from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, text, text) from public;
grant execute on function public.consume_rate_limit(text, text, text) to anon, authenticated;
