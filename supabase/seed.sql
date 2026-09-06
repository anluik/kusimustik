-- Development seed: one owner and two waves of the same annual survey.
--
-- The two waves share a wave_group_id and every question key, but have distinct
-- question ids and two deliberately reworded titles — which is exactly the case
-- wave comparison has to survive (DECISIONS 003). Answer distributions differ
-- between the waves so the charts have something to show; they are derived from
-- the response number rather than random(), so `pnpm db:reset` is reproducible.
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
  {"id": "10000000-0000-4000-8000-000000000001", "key": "intro", "type": "statement",
   "title": "Aitäh, et osalete", "description": "Vastamine võtab umbes kolm minutit."},
  {"id": "10000000-0000-4000-8000-000000000002", "key": "role", "type": "single_choice",
   "title": "Milline roll kirjeldab teid kõige paremini?", "required": true,
   "options": [{"value": "student", "label": "Üliõpilane"},
               {"value": "teacher", "label": "Õppejõud"},
               {"value": "staff", "label": "Tugitöötaja"}]},
  {"id": "10000000-0000-4000-8000-000000000003", "key": "channels", "type": "multi_choice",
   "title": "Kust saite küsitluse kohta teada?", "required": true,
   "minSelections": 1, "maxSelections": 3,
   "options": [{"value": "email", "label": "E-kiri"},
               {"value": "facebook", "label": "Facebook"},
               {"value": "newsletter", "label": "Uudiskiri"},
               {"value": "word_of_mouth", "label": "Sõbra soovitus"}]},
  {"id": "10000000-0000-4000-8000-000000000004", "key": "country", "type": "dropdown",
   "title": "Riik", "required": true,
   "options": [{"value": "ee", "label": "Eesti"},
               {"value": "lv", "label": "Läti"},
               {"value": "lt", "label": "Leedu"},
               {"value": "fi", "label": "Soome"}]},
  {"id": "10000000-0000-4000-8000-000000000005", "key": "city", "type": "short_text",
   "title": "Linn", "required": false, "maxLength": 100},
  {"id": "10000000-0000-4000-8000-000000000006", "key": "feedback", "type": "long_text",
   "title": "Mida saaksime paremini teha?", "required": false, "maxLength": 2000},
  {"id": "10000000-0000-4000-8000-000000000007", "key": "satisfaction", "type": "opinion_scale",
   "title": "Kui rahul olete teenusega?", "required": true,
   "max": 5, "minLabel": "Ei ole rahul", "maxLabel": "Väga rahul"},
  {"id": "10000000-0000-4000-8000-000000000008", "key": "recommend", "type": "nps",
   "title": "Kui tõenäoliselt soovitaksite meid sõbrale?", "required": true},
  {"id": "10000000-0000-4000-8000-000000000009", "key": "team_ratings", "type": "matrix_single",
   "title": "Hinnake meie tiimi", "required": true,
   "rows": [{"value": "speed", "label": "Kiirus"},
            {"value": "clarity", "label": "Selgus"},
            {"value": "support", "label": "Tugi"}],
   "columns": [{"value": "poor", "label": "Halb"},
               {"value": "ok", "label": "Rahuldav"},
               {"value": "good", "label": "Hea"}]}
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
  {"id": "20000000-0000-4000-8000-000000000001", "key": "intro", "type": "statement",
   "title": "Aitäh, et osalete", "description": "Vastamine võtab umbes kolm minutit."},
  {"id": "20000000-0000-4000-8000-000000000002", "key": "role", "type": "single_choice",
   "title": "Milline roll kirjeldab teid kõige paremini?", "required": true,
   "options": [{"value": "student", "label": "Üliõpilane"},
               {"value": "teacher", "label": "Õppejõud"},
               {"value": "staff", "label": "Tugitöötaja"}]},
  {"id": "20000000-0000-4000-8000-000000000003", "key": "channels", "type": "multi_choice",
   "title": "Kust saite küsitluse kohta teada?", "required": true,
   "minSelections": 1, "maxSelections": 3,
   "options": [{"value": "email", "label": "E-kiri"},
               {"value": "facebook", "label": "Facebook"},
               {"value": "newsletter", "label": "Uudiskiri"},
               {"value": "word_of_mouth", "label": "Sõbra soovitus"}]},
  {"id": "20000000-0000-4000-8000-000000000004", "key": "country", "type": "dropdown",
   "title": "Riik", "required": true,
   "options": [{"value": "ee", "label": "Eesti"},
               {"value": "lv", "label": "Läti"},
               {"value": "lt", "label": "Leedu"},
               {"value": "fi", "label": "Soome"}]},
  {"id": "20000000-0000-4000-8000-000000000005", "key": "city", "type": "short_text",
   "title": "Linn", "required": false, "maxLength": 100},
  {"id": "20000000-0000-4000-8000-000000000006", "key": "feedback", "type": "long_text",
   "title": "Mida peaksime järgmisel aastal muutma?", "required": false, "maxLength": 2000},
  {"id": "20000000-0000-4000-8000-000000000007", "key": "satisfaction", "type": "opinion_scale",
   "title": "Kui rahul olete meie teenusega sel aastal?", "required": true,
   "max": 5, "minLabel": "Ei ole rahul", "maxLabel": "Väga rahul"},
  {"id": "20000000-0000-4000-8000-000000000008", "key": "recommend", "type": "nps",
   "title": "Kui tõenäoliselt soovitaksite meid sõbrale?", "required": true},
  {"id": "20000000-0000-4000-8000-000000000009", "key": "team_ratings", "type": "matrix_single",
   "title": "Hinnake meie tiimi", "required": true,
   "rows": [{"value": "speed", "label": "Kiirus"},
            {"value": "clarity", "label": "Selgus"},
            {"value": "support", "label": "Tugi"}],
   "columns": [{"value": "poor", "label": "Halb"},
               {"value": "ok", "label": "Rahuldav"},
               {"value": "good", "label": "Hea"}]}
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
