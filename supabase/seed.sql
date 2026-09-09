-- Development seed: one owner and two waves of the same annual survey.
--
-- The two waves share a wave_group_id and every question key, but have distinct
-- question ids and two deliberately reworded titles — which is exactly the case
-- wave comparison has to survive (DECISIONS 003). Answer distributions differ
-- between the waves so the charts have something to show; they are derived from
-- the response number rather than random(), so `pnpm db:reset` is reproducible.
--
-- Every piece of respondent-facing text in the documents below is a
-- locale-keyed map ({"et": "..."}), which is what surveys.elements holds from
-- the 20260909120000 migration onward. These two waves are Estonian and
-- translated into nothing, which is what the migration left every survey
-- looking like. See docs/DECISIONS.md 030.
--
-- Sign in as owner@kusimustik.test / password123.

-- The owner ------------------------------------------------------------------

-- The empty-string token columns are not optional: GoTrue scans them into
-- non-nullable strings and a null there fails every sign-in with "Database
-- error querying schema".
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000',
        '00000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated',
        'owner@kusimustik.test',
        extensions.crypt('password123', extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        '{"display_name": "Kadri Kask"}'::jsonb,
        '', '', '', '');

insert into auth.identities (provider_id, user_id, identity_data, provider,
                             last_sign_in_at, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
        '{"sub": "00000000-0000-4000-8000-000000000001", "email": "owner@kusimustik.test", "email_verified": true, "phone_verified": false}'::jsonb,
        'email', now(), now(), now());

-- Wave one — 2025 -------------------------------------------------------------

insert into public.surveys (id, owner_id, title, description, status, slug, locale,
                            wave_group_id, wave_label, elements, published_at)
values ('00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-000000000001',
        'Teenuse rahulolu-uuring',
        'Iga-aastane rahulolu-uuring.',
        'published', 'rahulolu-2025', 'et',
        '00000000-0000-4000-8000-00000000000f',
        '2025',
        $elements$
[
  {
    "id": "10000000-0000-4000-8000-000000000001",
    "key": "intro",
    "type": "statement",
    "title": {"et": "Aitäh, et osalete"},
    "description": {"et": "Vastamine võtab umbes kolm minutit."}
  },
  {
    "id": "10000000-0000-4000-8000-000000000002",
    "key": "role",
    "type": "single_choice",
    "title": {"et": "Milline roll kirjeldab teid kõige paremini?"},
    "required": true,
    "options": [
      {"value": "student", "label": {"et": "Üliõpilane"}},
      {"value": "teacher", "label": {"et": "Õppejõud"}},
      {"value": "staff", "label": {"et": "Tugitöötaja"}}
    ]
  },
  {
    "id": "10000000-0000-4000-8000-000000000003",
    "key": "channels",
    "type": "multi_choice",
    "title": {"et": "Kust saite küsitluse kohta teada?"},
    "required": true,
    "minSelections": 1,
    "maxSelections": 3,
    "options": [
      {"value": "email", "label": {"et": "E-kiri"}},
      {"value": "facebook", "label": {"et": "Facebook"}},
      {"value": "newsletter", "label": {"et": "Uudiskiri"}},
      {"value": "word_of_mouth", "label": {"et": "Sõbra soovitus"}}
    ]
  },
  {
    "id": "10000000-0000-4000-8000-000000000004",
    "key": "country",
    "type": "dropdown",
    "title": {"et": "Riik"},
    "required": true,
    "options": [
      {"value": "ee", "label": {"et": "Eesti"}},
      {"value": "lv", "label": {"et": "Läti"}},
      {"value": "lt", "label": {"et": "Leedu"}},
      {"value": "fi", "label": {"et": "Soome"}}
    ]
  },
  {
    "id": "10000000-0000-4000-8000-000000000005",
    "key": "city",
    "type": "short_text",
    "title": {"et": "Linn"},
    "required": false,
    "maxLength": 100
  },
  {
    "id": "10000000-0000-4000-8000-000000000006",
    "key": "feedback",
    "type": "long_text",
    "title": {"et": "Mida saaksime paremini teha?"},
    "required": false,
    "maxLength": 2000
  },
  {
    "id": "10000000-0000-4000-8000-000000000007",
    "key": "satisfaction",
    "type": "opinion_scale",
    "title": {"et": "Kui rahul olete teenusega?"},
    "required": true,
    "max": 5,
    "minLabel": {"et": "Ei ole rahul"},
    "maxLabel": {"et": "Väga rahul"}
  },
  {
    "id": "10000000-0000-4000-8000-000000000008",
    "key": "recommend",
    "type": "nps",
    "title": {"et": "Kui tõenäoliselt soovitaksite meid sõbrale?"},
    "required": true
  },
  {
    "id": "10000000-0000-4000-8000-000000000009",
    "key": "team_ratings",
    "type": "matrix_single",
    "title": {"et": "Hinnake meie tiimi"},
    "required": true,
    "rows": [
      {"value": "speed", "label": {"et": "Kiirus"}},
      {"value": "clarity", "label": {"et": "Selgus"}},
      {"value": "support", "label": {"et": "Tugi"}}
    ],
    "columns": [
      {"value": "poor", "label": {"et": "Halb"}},
      {"value": "ok", "label": {"et": "Rahuldav"}},
      {"value": "good", "label": {"et": "Hea"}}
    ]
  }
]
$elements$::jsonb,
        timestamptz '2025-04-01 09:00:00+03');

-- Wave two — 2026. Same keys, new question ids, two reworded titles.

insert into public.surveys (id, owner_id, title, description, status, slug, locale,
                            wave_group_id, wave_label, elements, published_at)
values ('00000000-0000-4000-8000-0000000000a2',
        '00000000-0000-4000-8000-000000000001',
        'Teenuse rahulolu-uuring',
        'Iga-aastane rahulolu-uuring.',
        'published', 'rahulolu-2026', 'et',
        '00000000-0000-4000-8000-00000000000f',
        '2026',
        $elements$
[
  {
    "id": "20000000-0000-4000-8000-000000000001",
    "key": "intro",
    "type": "statement",
    "title": {"et": "Aitäh, et osalete"},
    "description": {"et": "Vastamine võtab umbes kolm minutit."}
  },
  {
    "id": "20000000-0000-4000-8000-000000000002",
    "key": "role",
    "type": "single_choice",
    "title": {"et": "Milline roll kirjeldab teid kõige paremini?"},
    "required": true,
    "options": [
      {"value": "student", "label": {"et": "Üliõpilane"}},
      {"value": "teacher", "label": {"et": "Õppejõud"}},
      {"value": "staff", "label": {"et": "Tugitöötaja"}}
    ]
  },
  {
    "id": "20000000-0000-4000-8000-000000000003",
    "key": "channels",
    "type": "multi_choice",
    "title": {"et": "Kust saite küsitluse kohta teada?"},
    "required": true,
    "minSelections": 1,
    "maxSelections": 3,
    "options": [
      {"value": "email", "label": {"et": "E-kiri"}},
      {"value": "facebook", "label": {"et": "Facebook"}},
      {"value": "newsletter", "label": {"et": "Uudiskiri"}},
      {"value": "word_of_mouth", "label": {"et": "Sõbra soovitus"}}
    ]
  },
  {
    "id": "20000000-0000-4000-8000-000000000004",
    "key": "country",
    "type": "dropdown",
    "title": {"et": "Riik"},
    "required": true,
    "options": [
      {"value": "ee", "label": {"et": "Eesti"}},
      {"value": "lv", "label": {"et": "Läti"}},
      {"value": "lt", "label": {"et": "Leedu"}},
      {"value": "fi", "label": {"et": "Soome"}}
    ]
  },
  {
    "id": "20000000-0000-4000-8000-000000000005",
    "key": "city",
    "type": "short_text",
    "title": {"et": "Linn"},
    "required": false,
    "maxLength": 100
  },
  {
    "id": "20000000-0000-4000-8000-000000000006",
    "key": "feedback",
    "type": "long_text",
    "title": {"et": "Mida peaksime järgmisel aastal muutma?"},
    "required": false,
    "maxLength": 2000
  },
  {
    "id": "20000000-0000-4000-8000-000000000007",
    "key": "satisfaction",
    "type": "opinion_scale",
    "title": {"et": "Kui rahul olete meie teenusega sel aastal?"},
    "required": true,
    "max": 5,
    "minLabel": {"et": "Ei ole rahul"},
    "maxLabel": {"et": "Väga rahul"}
  },
  {
    "id": "20000000-0000-4000-8000-000000000008",
    "key": "recommend",
    "type": "nps",
    "title": {"et": "Kui tõenäoliselt soovitaksite meid sõbrale?"},
    "required": true
  },
  {
    "id": "20000000-0000-4000-8000-000000000009",
    "key": "team_ratings",
    "type": "matrix_single",
    "title": {"et": "Hinnake meie tiimi"},
    "required": true,
    "rows": [
      {"value": "speed", "label": {"et": "Kiirus"}},
      {"value": "clarity", "label": {"et": "Selgus"}},
      {"value": "support", "label": {"et": "Tugi"}}
    ],
    "columns": [
      {"value": "poor", "label": {"et": "Halb"}},
      {"value": "ok", "label": {"et": "Rahuldav"}},
      {"value": "good", "label": {"et": "Hea"}}
    ]
  }
]
$elements$::jsonb,
        timestamptz '2026-04-01 09:00:00+03');

-- Responses -------------------------------------------------------------------

insert into public.responses (id, survey_id, locale, submitted_at)
select ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-4000-8000-0000000000a1',
       'et',
       timestamptz '2025-04-01 10:00:00+03' + (n * interval '5 hours')
from generate_series(1, 30) as n;

insert into public.responses (id, survey_id, locale, submitted_at)
select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-4000-8000-0000000000a2',
       'et',
       timestamptz '2026-04-01 10:00:00+03' + (n * interval '5 hours')
from generate_series(1, 30) as n;

-- Wave one answers. 15/9/6 on role, mean satisfaction 3.2, NPS -10.

with r as (select n, ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid as id
           from generate_series(1, 30) as n)
insert
into public.answers (response_id, survey_id, question_id, value)
select r.id, '00000000-0000-4000-8000-0000000000a1', a.question_id, a.value
from r,
     lateral (values
         ('10000000-0000-4000-8000-000000000002'::uuid,
          jsonb_build_object('type', 'single_choice', 'value',
                             case when r.n <= 15 then 'student'
                                  when r.n <= 24 then 'teacher'
                                  else 'staff' end)),
         ('10000000-0000-4000-8000-000000000003'::uuid,
          jsonb_build_object('type', 'multi_choice', 'values',
                             case r.n % 4
                                 when 1 then '["email", "facebook"]'::jsonb
                                 when 2 then '["newsletter"]'::jsonb
                                 when 3 then '["email"]'::jsonb
                                 else '["word_of_mouth", "email", "facebook"]'::jsonb end)),
         ('10000000-0000-4000-8000-000000000004'::uuid,
          jsonb_build_object('type', 'dropdown', 'value',
                             case when r.n <= 18 then 'ee'
                                  when r.n <= 24 then 'lv'
                                  when r.n <= 27 then 'lt'
                                  else 'fi' end)),
         -- Optional: six respondents skip the city, and a skip is the absence
         -- of a row, never an empty string.
         ('10000000-0000-4000-8000-000000000005'::uuid,
          case when r.n % 5 = 0 then null
               else jsonb_build_object('type', 'short_text', 'value',
                                       case r.n % 4
                                           when 0 then 'Tallinn'
                                           when 1 then 'Tartu'
                                           when 2 then 'Pärnu'
                                           else 'Narva' end) end),
         ('10000000-0000-4000-8000-000000000006'::uuid,
          case when r.n % 6 <> 0 then null
               else jsonb_build_object('type', 'long_text', 'value',
                                       case r.n % 3
                                           when 0 then 'Vastamine võiks olla kiirem.'
                                           else 'Rohkem infot enne küsitlust.' end) end),
         ('10000000-0000-4000-8000-000000000007'::uuid,
          jsonb_build_object('type', 'opinion_scale', 'value',
                             case when r.n <= 3 then 1
                                  when r.n <= 9 then 2
                                  when r.n <= 18 then 3
                                  when r.n <= 25 then 4
                                  else 5 end)),
         ('10000000-0000-4000-8000-000000000008'::uuid,
          jsonb_build_object('type', 'nps', 'value',
                             case when r.n <= 12 then r.n % 7
                                  when r.n <= 21 then 7 + (r.n % 2)
                                  else 9 + (r.n % 2) end)),
         ('10000000-0000-4000-8000-000000000009'::uuid,
          jsonb_build_object('type', 'matrix_single', 'values', jsonb_build_object(
              'speed', case when r.n <= 10 then 'poor' when r.n <= 20 then 'ok' else 'good' end,
              'clarity', case when r.n <= 6 then 'poor' when r.n <= 18 then 'ok' else 'good' end,
              'support', case when r.n <= 14 then 'poor' when r.n <= 22 then 'ok' else 'good' end)))
         ) as a(question_id, value)
where a.value is not null;

-- Wave two answers. 9/12/9 on role, mean satisfaction 4.0, NPS +40.

with r as (select n, ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid as id
           from generate_series(1, 30) as n)
insert
into public.answers (response_id, survey_id, question_id, value)
select r.id, '00000000-0000-4000-8000-0000000000a2', a.question_id, a.value
from r,
     lateral (values
         ('20000000-0000-4000-8000-000000000002'::uuid,
          jsonb_build_object('type', 'single_choice', 'value',
                             case when r.n <= 9 then 'student'
                                  when r.n <= 21 then 'teacher'
                                  else 'staff' end)),
         ('20000000-0000-4000-8000-000000000003'::uuid,
          jsonb_build_object('type', 'multi_choice', 'values',
                             case r.n % 4
                                 when 1 then '["newsletter", "email"]'::jsonb
                                 when 2 then '["facebook"]'::jsonb
                                 when 3 then '["word_of_mouth"]'::jsonb
                                 else '["email"]'::jsonb end)),
         ('20000000-0000-4000-8000-000000000004'::uuid,
          jsonb_build_object('type', 'dropdown', 'value',
                             case when r.n <= 12 then 'ee'
                                  when r.n <= 20 then 'lv'
                                  when r.n <= 26 then 'lt'
                                  else 'fi' end)),
         ('20000000-0000-4000-8000-000000000005'::uuid,
          case when r.n % 7 = 0 then null
               else jsonb_build_object('type', 'short_text', 'value',
                                       case r.n % 4
                                           when 0 then 'Tallinn'
                                           when 1 then 'Tartu'
                                           when 2 then 'Viljandi'
                                           else 'Narva' end) end),
         ('20000000-0000-4000-8000-000000000006'::uuid,
          case when r.n % 5 <> 0 then null
               else jsonb_build_object('type', 'long_text', 'value',
                                       case r.n % 3
                                           when 0 then 'Teenus on selgelt paranenud.'
                                           else 'Ootan mobiilirakendust.' end) end),
         ('20000000-0000-4000-8000-000000000007'::uuid,
          jsonb_build_object('type', 'opinion_scale', 'value',
                             case when r.n <= 2 then 2
                                  when r.n <= 8 then 3
                                  when r.n <= 20 then 4
                                  else 5 end)),
         ('20000000-0000-4000-8000-000000000008'::uuid,
          jsonb_build_object('type', 'nps', 'value',
                             case when r.n <= 6 then r.n % 7
                                  when r.n <= 12 then 7 + (r.n % 2)
                                  else 9 + (r.n % 2) end)),
         ('20000000-0000-4000-8000-000000000009'::uuid,
          jsonb_build_object('type', 'matrix_single', 'values', jsonb_build_object(
              'speed', case when r.n <= 4 then 'poor' when r.n <= 14 then 'ok' else 'good' end,
              'clarity', case when r.n <= 3 then 'poor' when r.n <= 12 then 'ok' else 'good' end,
              'support', case when r.n <= 8 then 'poor' when r.n <= 18 then 'ok' else 'good' end)))
         ) as a(question_id, value)
where a.value is not null;

-- Interaction events for wave two ---------------------------------------------
--
-- The drop-off funnel (PLAN Phase 7) reads survey_events, and Phase 6 only
-- emits them from a live runner — so without these the report renders its empty
-- state against a survey that plainly has 30 responses, which is the one thing
-- it must not do. Wave one is deliberately left without events: a survey that
-- collected responses before the instrumentation existed is a real state, and
-- the empty state has to be reachable somewhere.
--
-- Session ids are synthetic here. In production they are anonymous, per-visit,
-- and never written to responses (DECISIONS 004) — the same is true of these:
-- session n does not correspond to response n, and nothing joins them.
--
-- Shape: 50 visits, 42 of which start, declining reach across the eight
-- questions with a deliberate cliff at the free-text question, and 30 submits
-- to match the 30 seeded responses. Dwell is constant per question so the
-- median is exact and `pnpm test:db` can assert it.

-- 50 views.
insert into public.survey_events (survey_id, session_id, question_id, type, at, meta)
select '00000000-0000-4000-8000-0000000000a2',
       ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       null,
       'view',
       timestamptz '2026-04-01 09:00:00+03' + (n * interval '3 hours'),
       jsonb_build_object('device', case when n % 3 = 0 then 'mobile' else 'desktop' end,
                          'referrer', case when n % 5 = 0 then 'direct' else 'link' end)
from generate_series(1, 50) as n;

-- 42 of them begin answering.
insert into public.survey_events (survey_id, session_id, question_id, type, at, meta)
select '00000000-0000-4000-8000-0000000000a2',
       ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       null,
       'start',
       timestamptz '2026-04-01 09:00:00+03' + (n * interval '3 hours') + interval '12 seconds',
       null
from generate_series(1, 42) as n;

-- Per-question reach and answers. `reached` is how many sessions saw the card,
-- `answered` how many left it holding an acceptable answer — the gap on the two
-- optional questions (city, feedback) is people skipping, not dropping out.
with q(pos, question_id, reached, answered, dwell_ms) as (values
    (1, '20000000-0000-4000-8000-000000000002'::uuid, 42, 41,  4200),
    (2, '20000000-0000-4000-8000-000000000003'::uuid, 41, 40,  8600),
    (3, '20000000-0000-4000-8000-000000000004'::uuid, 40, 39,  3100),
    (4, '20000000-0000-4000-8000-000000000005'::uuid, 39, 27,  5200),
    -- The cliff: a long free-text question two thirds of the way in.
    (5, '20000000-0000-4000-8000-000000000006'::uuid, 38, 19, 41000),
    (6, '20000000-0000-4000-8000-000000000007'::uuid, 32, 32,  3800),
    (7, '20000000-0000-4000-8000-000000000008'::uuid, 31, 31,  3200),
    (8, '20000000-0000-4000-8000-000000000009'::uuid, 31, 30, 14500))
insert
into public.survey_events (survey_id, session_id, question_id, type, at, meta)
select '00000000-0000-4000-8000-0000000000a2',
       ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       q.question_id,
       e.type,
       timestamptz '2026-04-01 09:00:00+03'
           + (n * interval '3 hours')
           + interval '12 seconds'
           + (q.pos * interval '20 seconds')
           + e.after,
       e.meta
from q,
     generate_series(1, 42) as n,
     lateral (values
         ('question_view'::text, interval '0 seconds', null::jsonb, q.reached),
         ('question_answer', make_interval(secs => q.dwell_ms / 1000.0),
          jsonb_build_object('dwellMs', q.dwell_ms), q.answered)
         ) as e(type, after, meta, cutoff)
where n <= e.cutoff;

-- 30 submits — the 30 responses above — and 12 abandons, which is every session
-- that started and did not finish.
insert into public.survey_events (survey_id, session_id, question_id, type, at, meta)
select '00000000-0000-4000-8000-0000000000a2',
       ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       null,
       case when n <= 30 then 'submit' else 'abandon' end,
       timestamptz '2026-04-01 09:00:00+03' + (n * interval '3 hours') + interval '5 minutes',
       null
from generate_series(1, 42) as n;
