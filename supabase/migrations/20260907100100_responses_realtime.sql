-- Live response count on the results page. Phase 7 of docs/PLAN.md.
--
-- Only `responses` joins the publication, and only for the count. `answers` is
-- deliberately left out: an owner watching a survey does not need each answer
-- pushed at them as it lands, and streaming answer payloads to a browser that
-- is only rendering a number would be a lot of somebody's data in flight for
-- no reason. The count arrives, the page refetches if the owner wants detail.
--
-- Realtime authorises each subscriber with the RLS policy on the published
-- table, so "responses: owner reads" is what stops one owner watching another
-- owner's submissions arrive. That policy already exists and is not relaxed
-- here — this migration only makes the table visible to the publication.
--
-- `survey_events` is not published either. It is the highest-volume table in
-- the schema and nothing on screen is live against it.

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    then
        -- Idempotent: the publication survives `db reset` in some setups, and
        -- adding a table twice is an error rather than a no-op.
        if not exists (select 1
                       from pg_publication_tables
                       where pubname = 'supabase_realtime'
                         and schemaname = 'public'
                         and tablename = 'responses')
        then
            alter publication supabase_realtime add table public.responses;
        end if;
    end if;
end;
$$;

-- The default replica identity (primary key) is enough: an INSERT carries its
-- whole new row regardless, and the page never listens for updates or deletes —
-- a submitted response is immutable and has no UPDATE policy.
