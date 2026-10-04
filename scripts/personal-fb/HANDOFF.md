# Handoff: personal Facebook profile collection

Written 2026-10-04. See "State" below for what is live. The development
database has neither migration 010 nor 011.

## Goal

Understand how Liz's personal Facebook profile performs, including its
followers (1,122 on 2026-10-04). No API can read this profile.

## Design

A Python script on Liz's laptop drives a dedicated, logged in Chrome profile
and reads three screens: the profile timeline, the dashboard's Content Library,
and the dashboard's Audience screen. It sends one payload per run, a
"collection", to `/api/ingest/personal`, which validates it in full and writes
it in one transaction. `README.md` in this folder is the operating manual.

## Files in the commit

| File | State |
|---|---|
| `db/migrations/010_personal_profile_posts.sql` | Written. NOT run on Neon |
| `db/migrations/010_personal_profile_posts_rollback.sql` | Written. Refuses while data exists |
| `db/schema.sql` | Two edits: posts platform check, content_posts exclusion |
| `lib/personal-ingest.ts` | Validation and SQL. Type checks |
| `app/api/ingest/personal/route.ts` | Route. Tested on Neon's driver against a disposable database. Not deployed |
| `lib/profile.ts`, `app/dashboard/profile/page.tsx` | Facebook Profile page. Reviewed in Chrome against the disposable database |
| `app/dashboard/layout.tsx` | One line: the Profile nav entry |
| `scripts/personal-fb/scrape.py` | Live dry run works. Never pushed to production |
| `scripts/personal-fb/collect.py`, `register-protocol.ps1` | The on demand collector and its one time link registration. Preview run, nothing registered |
| `scripts/personal-fb/README.md`, `requirements.txt`, `env.example`, `.gitignore` | Written |

The working tree also holds unrelated uncommitted work that is not part of
this task and must not be bundled into its commit: `app/admin/sync/*`,
`lib/meta.ts`, `vercel.json`, `app/api/sync/account/`.

Local only and ignored by git: `.venv/`, `chrome-profile/` (a live Facebook
session), `dry-run-output.json`, `probe-output.json`, `scrape.log`.

## What was verified, and how

- **Live, against Facebook, 2026-10-04:** the dry run read 15 timeline posts,
  53 library rows (21 posts, 32 stories) and the audience figures. Two posts
  were checked by eye in Liz's own Chrome and matched: reactions, comments,
  reaction breakdown, Viewers, publish time, and total followers.
- **Real database engine, disposable:** 41 checks on an in-process Postgres
  (PGlite) built from the committed `schema.sql`, migration 002 and migration
  010, running the same statements the route runs. Covers repeat payloads,
  manual row protection, nulls, caption protection, missing library rows,
  follower gaps, refusals and rollback.
- **Simulated fixtures:** 14 checks on the scraper's payload builder for
  ambiguous joins, format and time support, and the timezone check.
- **Real Neon driver, isolated database:** 8 checks. The actual route ran under
  `next dev` against a database named `personal_ingest_test`, created on the
  development endpoint for the test and dropped afterwards. `sql.transaction`
  stored the real payload, a repeat was a retry, a changed body under the same
  ID got 409, a database error mid transaction rolled back whole, a manual
  audience row was left alone, and the Profile page rendered the stored
  figures. Simultaneous identical deliveries all return 200 with one stored and
  the rest marked as retries, and simultaneous different payloads sharing an ID
  give one 200 and one 409 (11 further checks).
- **schema.sql against the migration:** identical on a disposable Postgres
  across 63 columns, 55 constraints, 14 indexes and 3 views.
  `audience_snapshots` was missing from `schema.sql` before and was added.
- **Live dry run with the range named in the library URL:** worked, 53 rows
  under "Last 28 days".
- **Not verified:** the scraper's own push to a deployed route. The first
  controlled run covers it.

## Facts that took a live read to find

- The timeline is virtualized. Posts fill in only near the screen, so the
  script walks one post position at a time.
- The figure beside the like button is the total across reaction types. Labels
  such as "Like: 9 people" are the per type breakdown.
- The timeline timestamp label is attached lazily and is missing on about half
  the posts. The Content Library has an exact time for every row.
- The dashboard `content_id` is base64. A post decodes to
  `S:_I<profile>:<post>:<post>` and a story to `S:_ISC:<story>`. The post ID
  equals the `target_id` in the timeline's boost link, which is the join key.
- Posts that cannot be boosted have no boost link, so no post ID on the
  timeline. They join by caption, format and publish time, or not at all.
- The Content Library lists the last 28 days only and loads more rows as it
  scrolls.
- The profile header shows followers rounded (1.1K). The exact total is on the
  Audience screen.
- Reading a whole dashboard page also returns the Messenger sidebar. Every
  read is scoped to the table or to named labels for that reason.
- On 2026-10-04 the dashboard showed a "Profile is at risk" banner tied to
  content removals dated 9 May 2026. Liz says it is resolved and chose
  automated collection knowing it.

## State on 2026-10-04, evening

Checked directly against production (`ep-small-mud-az5opu7m`), not assumed.

- Migrations 010 and 011 are applied on production.
- The ingest route and Profile page are deployed at
  `https://qylat-analytics.vercel.app`.
- One controlled collection is stored: 53 posts, 711 observations, followers
  1,122. Nothing leaked into `content_posts` or `post_metrics`.
- `scripts/personal-fb/.env` holds `INGEST_URL` and the secret.
- There is no daily run and no background task. Liz rejected a 5 minute poller
  and chose on demand only. "Collect Facebook profile" on the Sync page writes
  a request and opens a `qylat-collect:` link, which Windows hands to
  `collect.py`. That claims the request and runs `scrape.py`. The request is
  what makes the link safe: nothing in the link is used, and without a request
  written by the logged in Sync page nothing runs.
- No Windows task exists. `register-task.ps1` and `poll.py` are gone.

## Remaining rollout, in order

1. Push `main` and let Vercel deploy the link based button.
2. Liz runs `register-protocol.ps1 -Preview`, then `register-protocol.ps1`.
3. Press the button once on the laptop and watch it through: requested,
   running, collected. This is the first real test of the link, of Chrome's
   prompt, and of the collector window.

## Open items

- Metric scope is stored as `unknown`. See Known limits in the README for what
  was seen on 2026-10-04 and the one case left untested.
- Timezone conversion is consistent with what was seen, not proven. The page
  shows publish times as Facebook displayed them and says so.
- The Profile page shows no trend over time yet. It shows the latest reading
  of each figure and when it was read.
- One run failed once with "browser has been closed" before loading. Cause
  unknown. The retry worked.
