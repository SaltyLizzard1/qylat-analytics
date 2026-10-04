# Personal Facebook profile scraper

Reads the personal profile once a day and sends one collection to
`/api/ingest/personal`. Runs on the laptop only. It cannot run on Vercel.

No API can read this profile. The script drives a dedicated Chrome profile that
you log in to by hand, once. It never sees or types the password, and it stops
at a login form or checkpoint instead of trying to get past it.

Automated access is against Meta's terms. This profile administers the Page
and the business portfolio, so a checkpoint here also affects the Meta sync.

## What one run reads

| Source | Screen | Figures |
|---|---|---|
| timeline | the profile, first 15 posts | Reactions (total), Reactions by type, Comments, Shares, caption |
| library | Dashboard, Content Library | Views, Viewers, Engagement, Earnings, Follows, Impressions, Comments, Distribution, Watch time, Average watch time, 3-second views, 1-minute views, exact publish time. Posts and stories |
| audience | Dashboard, Audience | Total followers (exact), Net follows, Unfollows |

Library and audience labels are Facebook's own and are stored unchanged, with
the reporting period shown beside them. Viewers is stored as Viewers. Nothing
is called reach. The four timeline labels are the scraper's, because the
timeline shows icons rather than words. Instagram views are not collected:
they exist only inside each post's own insights screen, which is not opened.

A figure that is blank or shown as `--` is stored with no value. That means
unknown. It never means zero.

## Before the first real run

1. Migration 010 has been run against production.
2. `PERSONAL_INGEST_SECRET` is set in Vercel production and the route is deployed.

Neither is needed for `--setup`, `--probe` or `--dry-run`.

## Install

From this folder, in PowerShell:

```
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

The script drives the Chrome already installed on the machine
(`BROWSER_CHANNEL=chrome`), so no browser download is needed.

## Configure

Copy `env.example` to `.env` and fill in `INGEST_URL` and
`PERSONAL_INGEST_SECRET`. The repo ignores `.env` files.

## Log in once

```
.venv\Scripts\python scrape.py --setup
```

This opens Chrome on a dedicated profile stored in `chrome-profile/` in this
folder. Log in to Facebook by hand in that window. The script reads nothing
from the page. It closes by itself once the session exists.

`chrome-profile/` is full access to the Facebook account. It is ignored by git
and must never be copied off this laptop. When the session stops working the
script exits with code 5. Run `--setup` again.

`--cookies` uses `cookies.json` in this folder instead of the profile. It is
optional, ignored by git, and must never be pasted anywhere.

## Run

| Command | What it does |
|---|---|
| `scrape.py --dry-run` | Reads everything, writes `dry-run-output.json`, sends nothing |
| `scrape.py` | Reads everything, saves `last-payload.json`, sends it |
| `scrape.py --resend` | Sends `last-payload.json` again, as the same collection |
| `scrape.py --probe` | Reports what the timeline shows, to `probe-output.json`. Sends nothing |

Always check a `--dry-run` against the profile before the first real run.

## How identity and repeats work

- A post is identified by its post ID and a story by its story ID, both decoded
  from the dashboard. A video ID is never an identity.
- A timeline post is joined to its library row by post ID. A post that cannot
  be boosted shows no post ID on the timeline. It is joined by caption only
  when exactly one library row agrees on caption, format and publish time.
  Anything else is logged as "Not merged" and nothing is written for it.
- Each run has its own `collection_id`. The dashboard stores every figure once
  per collection, so each day adds history.
- `--resend` sends the saved payload with its original `collection_id`. The
  dashboard recognises it and writes nothing a second time. Use it when a push
  failed, instead of scraping again.

## When a source cannot be read

Each source stands alone. A source that fails is marked failed and contributes
nothing: no posts, no figures, no zeros. The others are still stored.

- Library fails: timeline posts that have a post ID are stored with their
  timeline figures. No publish times are sent.
- Audience fails, or shows only a rounded figure: no follower total is sent.
- Every source fails: nothing is saved or sent, exit code 6.
- A post that is missing from a run is left exactly as it was. Posts leave the
  Content Library after 28 days and keep their last reading.

## Times

The Content Library shows clock times with no zone. They are converted from
Asia/Bangkok, which is the zone the browser is set to. The displayed text is
stored beside the converted time. Each run compares any timeline label counted
in minutes or hours against the library time for the same post:

- they agree: the collection is marked `consistent`
- no post had such a label that day: `unverified`
- they disagree by more than 90 minutes, or a publish time is in the future:
  nothing is saved or sent, exit code 8

## Followers

The exact total goes into `audience_snapshots` with source `scrape`, one row
per Asia/Bangkok day. A day that already has a manual row is skipped and the
log says so. Net follows and Unfollows are stored as the 28 day figures they
are. Daily change comes from the `profile_follower_changes` view, which marks
a change as daily only between consecutive days.

## Running it from the dashboard

There is no daily run and nothing runs in the background. A collection happens
when you press **Collect Facebook profile** on the dashboard's Sync page (Sync
now, top right), on this laptop.

The dashboard cannot start the scraper, because the scraper needs
`chrome-profile/` here. So the button does two things:

1. It writes a request (migration 011, `profile_run_requests`).
2. It opens a `qylat-collect:` link. Windows hands that link to `collect.py`,
   which claims the request, runs `scrape.py` in its own window, stops it after
   20 minutes, and reports the exit code and last log lines to the Sync page.

What to expect:

- Chrome asks "Open this application?" before it opens the collector. Allow it.
- The collector window shows the run. It closes by itself after a success and
  waits for Enter after a failure.
- Only one request can be open at a time, so pressing twice queues nothing.
- A request the collector does not claim within 5 minutes is withdrawn.
- Pressed from a phone or another computer, the button writes a request that
  nothing opens. It is withdrawn 5 minutes later and nothing runs.
- After exit code 5 (login form or checkpoint) the button reads "I have run
  --setup. Collect again", as a reminder not to send the same rejected session
  back to Facebook.

Why the link is safe: any web page can open a `qylat-collect:` link, and
nothing in the link is trusted or used. `collect.py` runs the scraper only
when there is a request to claim, and only a press on the logged in Sync page
writes one. Opened from anywhere else, it says nothing is waiting and stops.

`collect.py` logs to `collect.log`.

Register the link once:

```
powershell -ExecutionPolicy Bypass -File .egister-protocol.ps1 -Preview
powershell -ExecutionPolicy Bypass -File .egister-protocol.ps1
```

`-Preview` prints what would be written and changes nothing. The script writes
one key under `HKEY_CURRENT_USER\Software\Classes\qylat-collect`. That is your
own user's settings: no administrator rights, no other user affected. It
refuses if the venv, the Chrome profile or `.env` is missing. To undo it:
`.egister-protocol.ps1 -Remove`.

If this folder is ever moved, run the script again, since the key holds the
full path.

Running `scrape.py` by hand still works as before. Do not do it while a
button run is going: both would open the same Chrome profile.

## Reading the result

Everything is logged to the console and to `scrape.log` in this folder.

| Exit code | Meaning |
|---|---|
| 0 | Collection stored, or the dashboard already had it |
| 2 | `INGEST_URL` or `PERSONAL_INGEST_SECRET` missing |
| 3 | No saved session |
| 4 | Facebook did not resolve, did not respond, or showed no posts |
| 5 | Facebook showed a login form or a checkpoint. Do not rerun in a loop |
| 6 | No source could be read |
| 7 | Dashboard timed out, was unreachable, or refused. Use `--resend` |
| 8 | Publish times disagree with the timezone |
| 1 | Anything else, with a traceback in the log |

## Known limits

- Content Library scope is stored as `unknown`. What was seen on 2026-10-04:
  the library lists only posts published inside the selected range, and the
  range ends today. For such a row, "within the period" and "since it was
  published" are the same span, and the figures were identical under the 7 day
  and 28 day ranges and matched one post's lifetime insights. So each figure
  reads as a total to date. What was not tested is a range that ends in the
  past, which is the only case where the two meanings differ, and the scraper
  never uses one. Until that is settled the dashboard does not compare a
  library figure with an earlier reading.
- The timezone conversion is consistent with everything seen and is not proven.
  See Times above.
- A reel that cannot be boosted and whose timeline timestamp did not load is
  not merged that day, so its reactions, comments and shares are missing for
  that run. Its library figures are still stored.
- A blank comment or share figure on the timeline is stored as unknown. On the
  one post checked against its insights screen, blank shares meant zero.
- Text only posts and shared posts have not been seen on the timeline.
- Only the first 15 timeline posts and the last 28 days of the library are read.
