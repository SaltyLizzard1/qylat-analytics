"""
Daily read of the personal Facebook profile timeline, pushed to the dashboard.

No API can read this profile, so this script opens it in a browser with an
existing session, reads the first few posts, and POSTs them to
/api/ingest/personal. It never logs in with a username and password, and it
stops at the first login wall or checkpoint rather than trying to get past it.

The session lives in a dedicated Chrome profile folder beside this file,
chrome-profile/, which git ignores. Run --setup once and log in by hand in the
window it opens. The script never sees or types the password. cookies.json is
an optional alternative, used only with --cookies.

Modes:
  --setup     open the browser for a manual login. Reads and scrapes nothing.
  (no flag)   read the profile and push to the dashboard
  --dry-run   read the profile and print the payload, send nothing
  --probe     read the profile and report what is on the page: post types,
              IDs, timestamp labels, and every follower and post count it can
              find. Sends nothing. Writes probe-output.json beside this file.
Neither --dry-run nor --probe needs INGEST_URL or the secret.

What was checked against the live timeline on 2026-10-03, on one post, a reel:
  - each post is an element carrying aria-posinset
  - the text is in [data-ad-rendering-role="story_message"]
  - long text is cut behind a role=button reading "See more"
  - the feed is virtualized, so posts are collected after every scroll and
    merged, never parsed once at the end
  - the timestamp is not text inside the post. The link holds a span with
    aria-labelledby, and the label ("18 hours ago") sits in a hidden block
    elsewhere in the document. A second link full of scrambled characters is a
    zero size decoy and is ignored.
  - reels carry a data-video-id attribute, and posts that can be boosted carry
    an ad_center link with a target_id parameter

Not checked: text only posts, photo posts, shares, any timestamp label other
than "N hours ago", and every count. Followers, reactions, comments, shares,
views and reach are NOT collected by the normal run. The probe exists to find
out which of them the page shows at all.

Exit codes: 0 ok, 2 config, 3 no session, 4 Facebook did not load, 5 session
rejected, 6 nothing read, 7 dashboard push failed, 8 displayed times disagree
with the timezone, 1 anything else.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import random
import re
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
COOKIES_FILE = ROOT / "cookies.json"
ENV_FILE = ROOT / ".env"
LOG_FILE = ROOT / "scrape.log"
PROBE_FILE = ROOT / "probe-output.json"
DRY_RUN_FILE = ROOT / "dry-run-output.json"
LAST_PAYLOAD_FILE = ROOT / "last-payload.json"
PROFILE_DIR = ROOT / "chrome-profile"
DEBUG_DIR = ROOT / "debug"
# The range is named in the URL so the read never depends on whichever range the
# dashboard last showed. LAST_28D was checked on 2026-10-04 and gives
# "Last 28 days".
LIBRARY_URL = "https://www.facebook.com/professional_dashboard/content/content_library/?date_range=LAST_28D"
AUDIENCE_URL = "https://www.facebook.com/professional_dashboard/profile_insights/audience/"
LIBRARY_TABLE = 'table[aria-label="Content Library"]'
# How many Content Library rows to read. The table loads more as it scrolls.
LIBRARY_MAX_ROWS = 100
SETUP_TIMEOUT_S = 900

# Placeholder target. Override with PROFILE_URL in .env.
PROFILE_URL = "https://www.facebook.com/liz.alfond/"

LOCAL_TZ = ZoneInfo("Asia/Bangkok")
VIEWPORT = {"width": 1366, "height": 900}
# The walk reads one post position at a time. Facebook only renders the posts
# near the screen, so three large scrolls on 2026-10-04 read 4 of 18 positions
# and left the rest as empty shells.
MAX_POSTS = 15
POST_PAUSE = (1.5, 3.0)
# How long to wait for the next position to exist before calling the feed
# stalled, and for a position on screen to fill in.
STALL_WAIT_S = 12
RENDER_WAIT_S = 8
NAV_TIMEOUT_MS = 45000
FEED_TIMEOUT_MS = 30000
PUSH_TIMEOUT = (10, 30)  # connect, read

EXIT_OK, EXIT_OTHER, EXIT_CONFIG, EXIT_COOKIES = 0, 1, 2, 3
EXIT_FACEBOOK, EXIT_SESSION, EXIT_NO_POSTS, EXIT_PUSH, EXIT_TIMEZONE = 4, 5, 6, 7, 8

log = logging.getLogger("personal-fb")


class ScrapeError(Exception):
    """A failure with a known cause and its own exit code."""

    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.code = code


def setup_logging() -> None:
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    log.setLevel(logging.INFO)
    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(fmt)
    log.addHandler(stream)
    file = RotatingFileHandler(LOG_FILE, maxBytes=500_000, backupCount=3, encoding="utf-8")
    file.setFormatter(fmt)
    log.addHandler(file)


def load_env() -> None:
    """Read KEY=VALUE lines from .env beside this script. Real env vars win."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_config() -> dict:
    load_env()
    dump = "--dump" in sys.argv
    probe = "--probe" in sys.argv or dump
    dry_run = "--dry-run" in sys.argv or probe or "--setup" in sys.argv
    resend = "--resend" in sys.argv
    ingest_url = os.environ.get("INGEST_URL", "").strip()
    secret = os.environ.get("PERSONAL_INGEST_SECRET", "").strip()
    # Only a real push needs the dashboard. A dry run or probe sends nothing.
    if not dry_run or resend:
        missing = [n for n, v in (("INGEST_URL", ingest_url), ("PERSONAL_INGEST_SECRET", secret)) if not v]
        if missing:
            raise ScrapeError(f"Missing in {ENV_FILE.name} or the environment: {', '.join(missing)}", EXIT_CONFIG)
    return {
        "profile_url": os.environ.get("PROFILE_URL", PROFILE_URL).strip(),
        "ingest_url": ingest_url,
        "secret": secret,
        "headless": os.environ.get("HEADLESS", "false").lower() == "true",
        "channel": os.environ.get("BROWSER_CHANNEL", "chrome").strip(),
        "user_agent": os.environ.get("USER_AGENT", "").strip() or None,
        "dry_run": dry_run,
        "probe": probe,
        "use_cookies": "--cookies" in sys.argv,
        "dump": dump,
        "resend": resend,
    }


# ---------------------------------------------------------------- cookies

SAME_SITE = {"strict": "Strict", "lax": "Lax", "none": "None", "no_restriction": "None"}


def load_cookies() -> list[dict]:
    """
    Read cookies.json and shape it for Playwright. Accepts a plain list, as
    browser cookie export extensions write it, or a Playwright storage state
    object with a "cookies" key. Cookie values are never logged.
    """
    if not COOKIES_FILE.exists():
        raise ScrapeError(f"cookies.json is missing. Expected at {COOKIES_FILE}. See README.md.", EXIT_COOKIES)
    try:
        raw = json.loads(COOKIES_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        raise ScrapeError(f"cookies.json could not be read: {type(e).__name__}", EXIT_COOKIES) from None

    if isinstance(raw, dict):
        raw = raw.get("cookies")
    if not isinstance(raw, list) or not raw:
        raise ScrapeError("cookies.json holds no cookie list.", EXIT_COOKIES)

    cookies = []
    for c in raw:
        if not isinstance(c, dict) or "name" not in c or "value" not in c:
            continue
        domain = c.get("domain", "")
        if "facebook.com" not in domain:
            continue
        cookie = {
            "name": c["name"],
            "value": c["value"],
            "domain": domain,
            "path": c.get("path", "/"),
            "secure": bool(c.get("secure", True)),
            "httpOnly": bool(c.get("httpOnly", False)),
        }
        expires = c.get("expires", c.get("expirationDate"))
        if isinstance(expires, (int, float)) and expires > 0:
            cookie["expires"] = float(expires)
        same_site = SAME_SITE.get(str(c.get("sameSite", "")).lower())
        if same_site:
            cookie["sameSite"] = same_site
        cookies.append(cookie)

    names = {c["name"] for c in cookies}
    absent = [n for n in ("c_user", "xs") if n not in names]
    if absent:
        raise ScrapeError(
            f"cookies.json has no facebook.com {' or '.join(absent)} cookie, so it is not a logged in session.",
            EXIT_COOKIES,
        )

    now = time.time()
    expired = [c["name"] for c in cookies if c["name"] in ("c_user", "xs") and c.get("expires", now + 1) < now]
    if expired:
        raise ScrapeError(f"Session cookies have expired: {', '.join(expired)}. Export them again.", EXIT_COOKIES)

    return cookies


# ---------------------------------------------------------------- parsing

RELATIVE = re.compile(
    r"^(\d+|an?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)(\s+ago)?$", re.I
)
CLOCK = r"(\d{1,2}):(\d{2})\s*(AM|PM)"


def parse_timestamp(label: str, now: datetime) -> datetime | None:
    """
    Turn Facebook's label into a time, or None when it is not understood.
    Only "N hours ago" was seen on the live page. The other shapes are attempts,
    and anything unrecognised returns None rather than a guess.
    """
    text = " ".join(label.replace(" ", " ").split())
    if not text:
        return None
    if text.lower() == "just now":
        return now

    m = RELATIVE.match(text)
    if m:
        # "a day ago" and "an hour ago" read as one.
        n = 1 if m.group(1).lower() in ("a", "an") else int(m.group(1))
        unit = m.group(2).lower()[0]
        return now - {
            "m": timedelta(minutes=n),
            "h": timedelta(hours=n),
            "d": timedelta(days=n),
            "w": timedelta(weeks=n),
        }[unit]

    local_now = now.astimezone(LOCAL_TZ)

    m = re.match(rf"^(Today|Yesterday) at {CLOCK}$", text, re.I)
    if m:
        day = (local_now - timedelta(days=0 if m.group(1).lower() == "today" else 1)).date()
        clock = datetime.strptime(f"{m.group(2)}:{m.group(3)} {m.group(4).upper()}", "%I:%M %p").time()
        return datetime.combine(day, clock, LOCAL_TZ)

    # The timeline spells the month out. The dashboard abbreviates it.
    for fmt, has_year in (
        ("%B %d at %I:%M %p", False),
        ("%b %d at %I:%M %p", False),
        ("%B %d, %Y at %I:%M %p", True),
        ("%b %d, %Y at %I:%M %p", True),
        ("%B %d, %Y", True),
        ("%b %d, %Y", True),
        ("%B %d", False),
        ("%b %d", False),
    ):
        try:
            parsed = datetime.strptime(text if has_year else f"{text} 2000", fmt if has_year else f"{fmt} %Y")
        except ValueError:
            continue
        if not has_year:
            parsed = parsed.replace(year=local_now.year)
            if parsed.replace(tzinfo=LOCAL_TZ) > local_now + timedelta(days=1):
                parsed = parsed.replace(year=local_now.year - 1)
        return parsed.replace(tzinfo=LOCAL_TZ)

    return None


def find_timestamp_label(article, soup) -> str | None:
    """
    The timestamp link holds a span with aria-labelledby, and the label lives
    outside the post. Return the first such label inside a link.
    """
    for span in article.select("a[href] [aria-labelledby]"):
        target = soup.find(id=span.get("aria-labelledby"))
        if target is None:
            continue
        label = target.get_text(" ", strip=True)
        if label:
            return label
    return None


def find_native_id(article) -> str | None:
    """
    A stable ID from the page when one exists. The boost target is tried first:
    it is the post ID, and the Content Library carries the same number, which
    is what joins a timeline post to its dashboard row. The video ID is the
    fallback, and it does not join.
    """
    for a in article.select('a[href*="/ad_center/"]'):
        target = parse_qs(urlparse(a.get("href", "")).query).get("target_id", [""])[0]
        if re.fullmatch(r"\d{6,40}", target):
            return f"p{target}"
    video = article.select_one("[data-video-id]")
    if video and re.fullmatch(r"\d{6,40}", video.get("data-video-id", "")):
        return f"v{video['data-video-id']}"
    return None


def clean_text(message) -> str:
    text = message.get_text("\n", strip=True)
    text = re.sub(r"\s*(See more|See less)$", "", text)
    return text.rstrip("… \n").strip()


def text_hash_id(text: str) -> str:
    return "h" + hashlib.md5(" ".join(text.split()).encode("utf-8")).hexdigest()


PERMALINK_KINDS = ("/posts/", "/reel/", "/videos/", "/permalink")


def find_permalink(article) -> str | None:
    """
    The post's own URL when the page carries one, path only. The link holding
    the timestamp is tried first, since it is the post's own. On a shared post
    another link could belong to the original, which is unchecked.
    """
    anchors = article.select("a[href]")
    for a in [x for x in anchors if x.select_one("[aria-labelledby]")] + anchors:
        path = urlparse(a.get("href", "")).path
        if any(kind in path for kind in PERMALINK_KINDS):
            return f"https://www.facebook.com{path}"
    return None


def is_rendered(article) -> bool:
    """An empty shell has no roles at all. Facebook fills a post in only near the screen."""
    return article.select_one("[data-ad-rendering-role]") is not None


REACTION_LABEL = re.compile(r"^(Like|Love|Care|Haha|Wow|Sad|Angry): (\S+) (?:people|person)$")


def read_counts(article) -> dict:
    """
    The figures shown on a timeline post. None means the page showed nothing,
    which is unknown and is never turned into zero here.

    reactions_total is the figure beside the like button. Checked against the
    app on two posts on 2026-10-04: it is the total across every reaction type.
    reactions_by_type comes from labels such as "Like: 9 people". On the
    timeline only the Like label was ever present, so the other types are
    usually absent rather than zero.
    """
    out = {}
    for key, role in (("reactions_total", "like_button"), ("comments", "comment_button"), ("shares", "share_button")):
        el = article.select_one(f'[data-ad-rendering-role="{role}"]')
        near = near_text(el) if el is not None else None
        out[key] = near["count"] if near else None

    by_type = {}
    for el in article.select("[aria-label]"):
        m = REACTION_LABEL.match(el.get("aria-label", ""))
        if m:
            by_type[m.group(1).lower()] = parse_count(m.group(2))
    out["reactions_by_type"] = by_type or None
    return out


def parse_posts(html: str, now: datetime) -> tuple[list[dict], dict]:
    """Parse one snapshot. Returns the posts and what was skipped, by reason."""
    soup = BeautifulSoup(html, "html.parser")
    posts, skipped = [], {"no_id": 0, "unrendered": 0}

    for article in soup.select("[aria-posinset]"):
        if not is_rendered(article):
            skipped["unrendered"] += 1
            continue
        message = article.select_one('[data-ad-rendering-role="story_message"]')
        text = clean_text(message) if message else ""

        # A post with no caption is still a post. It is kept when the page
        # gives it an ID, and skipped only when there is nothing to track it by.
        native_id = find_native_id(article)
        if native_id:
            tracking_id, id_source = native_id, "native"
        elif text:
            tracking_id, id_source = text_hash_id(text), "text_hash"
        else:
            skipped["no_id"] += 1
            continue

        truncated = bool(message and message.find(string=re.compile(r"^\s*See more\s*$")))
        label = find_timestamp_label(article, soup)
        published = parse_timestamp(label, now) if label else None

        posts.append(
            {
                "tracking_id": tracking_id,
                "id_source": id_source,
                "text": text or None,
                "published_at": published.astimezone(timezone.utc).isoformat() if published else None,
                "timestamp_raw": label,
                "truncated": truncated,
                "permalink": find_permalink(article),
                "is_video": article.select_one("[data-video-id]") is not None,
                "counts": read_counts(article),
            }
        )

    return posts, skipped


# ---------------------------------------------------------------- dashboard pages
#
# The professional dashboard holds what the timeline does not: views, viewers,
# exact publish times and the exact follower total. Labels and reporting
# periods are kept exactly as Facebook words them. "Viewers" is stored as
# Viewers. It is never renamed to reach.

DURATION = re.compile(r"^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$")


def parse_metric(raw: str) -> dict:
    """
    One Content Library cell, as {raw, value, unit, exact}. value is None when
    no number was shown: raw "--" is Facebook's own "no figure" and raw None is
    a blank cell. Neither is zero. Text this cannot read keeps its raw form
    with no value rather than a guess.
    """
    empty = {"raw": None, "value": None, "unit": None, "exact": None}
    text = " ".join(raw.replace("\u2011", "-").split())
    if not text:
        return empty
    if set(text) <= {"-"}:
        return {**empty, "raw": "--"}
    count = parse_count(text)
    if count:
        return {"raw": text, "value": count["value"], "unit": "count", "exact": count["exact"]}
    m = DURATION.match(text)
    if m and any(m.groups()):
        h, mi, sec = (int(g) if g else 0 for g in m.groups())
        return {"raw": text, "value": h * 3600 + mi * 60 + sec, "unit": "seconds", "exact": True}
    m = re.fullmatch(r"([+-]?\d+(?:\.\d+)?)x", text)
    if m:
        return {"raw": text, "value": float(m.group(1)), "unit": "multiple", "exact": True}
    return {**empty, "raw": text}


def decode_content_id(content_id: str) -> tuple[str | None, str | None]:
    """
    The dashboard's content_id is base64. A post reads S:_I<profile>:<post>:<post>
    and a story reads S:_ISC:<story>. Returns (tracking_id, kind), where a
    post's tracking_id matches the boost target ID the timeline gives.
    """
    try:
        decoded = base64.b64decode(content_id + "=" * (-len(content_id) % 4)).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None, None
    m = re.fullmatch(r"S:_ISC:(\d{6,40})", decoded)
    if m:
        return f"s{m.group(1)}", "story"
    m = re.fullmatch(r"S:_I\d+:(\d{6,40}):\d+", decoded)
    if m:
        return f"p{m.group(1)}", "post"
    return None, None


def parse_library(table_html: str, now: datetime) -> tuple[list[str], list[dict]]:
    """The Content Library table: its column labels, and one dict per row."""
    soup = BeautifulSoup(table_html, "html.parser")
    columns = [" ".join(th.get_text(" ", strip=True).split()) for th in soup.select("th")]
    rows = []
    for tr in soup.select("tr"):
        cells = tr.select("td")
        link = tr.select_one('a[href*="/content/insights/"]')
        if len(cells) != len(columns) or link is None:
            continue
        content_id = parse_qs(urlparse(link.get("href", "")).query).get("content_id", [""])[0]
        tracking_id, kind = decode_content_id(content_id)
        if tracking_id is None:
            continue

        # The preview cell reads: title, status, publish time.
        preview = [x.strip() for x in cells[1].find_all(string=True) if x.strip()]
        date_label = preview[-1] if preview else None
        published = parse_timestamp(date_label, now) if date_label else None
        metrics = {
            label: parse_metric(cell.get_text(" ", strip=True))
            for label, cell in zip(columns, cells)
            if label and label != "Preview"
        }
        rows.append(
            {
                "tracking_id": tracking_id,
                "kind": kind,
                "title": preview[0] if preview else None,
                "status": preview[1].rstrip("\u2022\u00a0 ").strip() if len(preview) > 2 else None,
                "published_label": date_label,
                "published_at": published.astimezone(timezone.utc).isoformat() if published else None,
                "metrics": metrics,
            }
        )
    return [c for c in columns if c and c != "Preview"], rows


PERIOD_JS = """() => {
  const el = [...document.querySelectorAll('span, div')]
    .find(e => e.children.length === 0 && /^Last \\d+ days:/.test(e.textContent || ''));
  return el ? el.textContent : null;
}"""

# The figure sits beside its label: climb from the label until the block holds
# two lines, and the first is the value. Only these labels are read, so nothing
# else on the page, the chat sidebar included, is ever touched.
LABELLED_VALUE_JS = """labels => {
  const out = {};
  for (const label of labels) {
    let el = [...document.querySelectorAll('span, div')]
      .find(e => e.children.length === 0 && (e.textContent || '').trim() === label);
    out[label] = null;
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      const lines = (el.innerText || '').split('\\n').map(t => t.trim()).filter(Boolean);
      if (lines.length === 2 && lines[1] === label) { out[label] = lines[0]; break; }
      if (lines.length > 2) break;
    }
  }
  return out;
}"""


def collect_library(page) -> dict | None:
    """Read the Content Library. None, with the reason logged, when it cannot be read."""
    try:
        page.goto(LIBRARY_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        page.wait_for_selector(f"{LIBRARY_TABLE} td", timeout=FEED_TIMEOUT_MS)
    except PlaywrightError as e:
        log.error("Content Library did not load: %s", str(e).splitlines()[0])
        return None

    time.sleep(random.uniform(*POST_PAUSE))
    table = page.locator(LIBRARY_TABLE)
    columns: list[str] = []
    rows: dict[str, dict] = {}
    idle = 0
    while len(rows) < LIBRARY_MAX_ROWS and idle < 2:
        columns, found = parse_library(table.first.evaluate("e => e.outerHTML"), datetime.now(timezone.utc))
        before = len(rows)
        for row in found:
            rows.setdefault(row["tracking_id"], row)
        idle = idle + 1 if len(rows) == before else 0
        try:
            table.locator("tr").last.scroll_into_view_if_needed(timeout=3000)
        except PlaywrightError:
            page.mouse.wheel(0, 600)
        time.sleep(random.uniform(*POST_PAUSE))

    period = page.evaluate(PERIOD_JS)
    log.info("Content Library: %d rows, period %r.", len(rows), period)
    return {"period_label": period, "columns": columns, "rows": list(rows.values())[:LIBRARY_MAX_ROWS]}


def collect_audience(page) -> dict | None:
    """Read the Audience screen: the exact follower total and the period's follows."""
    labels = ["Total followers", "Net follows", "Unfollows"]
    try:
        page.goto(AUDIENCE_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        page.get_by_text("Total followers", exact=True).first.wait_for(timeout=FEED_TIMEOUT_MS)
    except PlaywrightError as e:
        log.error("Audience screen did not load: %s", str(e).splitlines()[0])
        return None

    time.sleep(random.uniform(*POST_PAUSE))
    values = page.evaluate(LABELLED_VALUE_JS, labels)
    period = page.evaluate(PERIOD_JS)
    out = {"period_label": period}
    for label in labels:
        out[label] = parse_count(values.get(label))
        if out[label] is None:
            log.warning("Audience: no figure found for %r.", label)
    log.info("Audience: period %r.", period)
    return out


# ---------------------------------------------------------------- probe
#
# The probe reports what the page shows and decides nothing. A count that is
# not found is reported as null, which means unknown. It never means zero.

COUNT = re.compile(r"^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([KMB])?$", re.I)
COUNT_IN_TEXT = re.compile(r"(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([KMB])?", re.I)
METRIC_WORDS = re.compile(r"\b(reactions?|likes?|comments?|shares?|views?|plays?|reach|followers?)\b", re.I)
LINK_KINDS = ("/reel/", "/posts/", "/photo", "/videos/", "/watch", "/share/", "/stories/", "/permalink", "story_fbid")


def parse_count(raw: str | None) -> dict | None:
    """
    "6" is exact. "1.1K" is a rounded display figure: the value is an
    approximation and is marked as such. None when the text is not a count.
    """
    if raw is None:
        return None
    m = COUNT.match(raw.strip())
    if not m:
        return None
    number, suffix = m.group(1).replace(",", ""), (m.group(2) or "").upper()
    value = float(number) * {"": 1, "K": 1_000, "M": 1_000_000, "B": 1_000_000_000}[suffix]
    return {"raw": raw.strip(), "value": int(round(value)), "exact": suffix == "" and "." not in number}


def near_text(el, levels: int = 4) -> dict | None:
    """
    The first text found on the element or one of its nearest ancestors. Once
    an ancestor holds more than a short figure it has left the button and
    reached the post, so the answer is unknown rather than whatever is there.
    """
    node = el
    for level in range(levels + 1):
        if node is None:
            return None
        text = node.get_text(" ", strip=True)
        if text:
            if len(text) > 12:
                return None
            return {"text": text, "level": level, "count": parse_count(text)}
        node = node.parent
    return None


def probe_profile(soup) -> dict:
    """Every place the page mentions followers, with the figure as displayed."""
    found, seen = [], set()
    for node in soup.find_all(string=re.compile(r"followers?", re.I)):
        # Page scripts mention followers inside JSON. That is not a figure.
        if node.find_parent(["script", "style"]) or node.find_parent(attrs={"aria-posinset": True}):
            continue
        text = " ".join(node.parent.get_text(" ", strip=True).split())[:80]
        if not COUNT_IN_TEXT.search(text) or text in seen:
            continue
        seen.add(text)
        m = COUNT_IN_TEXT.search(text)
        found.append({"text": text, "count": parse_count(m.group(0))})
        if len(found) >= 6:
            break
    return {"follower_mentions": found}


LABEL_WORDS = {
    "like", "likes", "reaction", "reactions", "comment", "comments", "share", "shares", "view", "views",
    "play", "plays", "reach", "people", "person", "and", "other", "others", "all", "see", "who", "reacted",
    "to", "this", "by",
}  # fmt: skip


def label_shape(aria: str) -> str:
    """
    An aria-label with every word that is not a metric word blanked to "_".
    These labels can carry the names of people who reacted. The figures and the
    wording around them are what matter.
    """
    out: list[str] = []
    for token in re.findall(r"\d[\d.,]*[KMB]?|[A-Za-z']+|[^\sA-Za-z\d]", aria):
        if not token[0].isalpha() or token.lower() in LABEL_WORDS:
            out.append(token.lower())
        elif not out or out[-1] != "_":
            out.append("_")
    return " ".join(out)[:80]


def probe_posts(html: str, now: datetime) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    out = []

    for article in soup.select("[aria-posinset]"):
        message = article.select_one('[data-ad-rendering-role="story_message"]')
        text = clean_text(message) if message else ""
        native_id = find_native_id(article)
        label = find_timestamp_label(article, soup)
        published = parse_timestamp(label, now) if label else None

        buttons = {}
        for role in ("like_button", "comment_button", "share_button"):
            el = article.select_one(f'[data-ad-rendering-role="{role}"]')
            buttons[role] = {"present": el is not None, "near": near_text(el) if el is not None else None}

        labels = []
        for el in article.select("[aria-label]"):
            aria = el.get("aria-label", "")
            if METRIC_WORDS.search(aria) and re.search(r"\d", aria):
                shape = label_shape(aria)
                if shape not in labels:
                    labels.append(shape)

        # Two places can state a reaction figure. When they disagree, both are
        # reported and neither is chosen.
        beside = (buttons["like_button"]["near"] or {}).get("count")
        label_values = set()
        for shape in labels:
            if re.search(r"\b(like|likes|reaction|reactions)\b", shape):
                for m in COUNT_IN_TEXT.finditer(shape):
                    c = parse_count(m.group(0))
                    if c:
                        label_values.add(c["value"])
        conflict = bool(beside and label_values and label_values != {beside["value"]})

        # Every short visible text with a digit outside the caption, so figures
        # such as "3 comments", "2 shares" or "1.2K views" show up wherever
        # Facebook puts them.
        short = []
        for node in article.find_all(string=re.compile(r"\d")):
            if node.find_parent(["script", "style"]) or (message and message in node.parents):
                continue
            t = " ".join(str(node).split())
            if t and len(t) <= 24 and t not in short:
                short.append(t)

        hrefs = [a.get("href", "") for a in article.select("a[href]")]
        spans = article.select("a[href] [aria-labelledby]")
        out.append(
            {
                "posinset": article.get("aria-posinset"),
                "rendered": is_rendered(article),
                "text_start": text[:40] if text else None,
                "text_length": len(text) if text else 0,
                "truncated": bool(message and message.find(string=re.compile(r"^\s*See more\s*$"))),
                "type_hints": {
                    "video": article.select_one("[data-video-id]") is not None,
                    "images": len([i for i in article.select("img[src]") if "scontent" in i.get("src", "")]),
                    "has_text": bool(text),
                    "roles": sorted({e["data-ad-rendering-role"] for e in article.select("[data-ad-rendering-role]")}),
                    "link_kinds": sorted({k for k in LINK_KINDS if any(k in h for h in hrefs)}),
                    "insights_link": any(
                        "insights" in a.get_text(" ", strip=True).lower() for a in article.select("a, [role=button]")
                    ),
                },
                "id": {
                    "source": "native" if native_id else ("text_hash" if text else None),
                    "kind": {"v": "video id", "p": "boost target id"}.get(native_id[0]) if native_id else None,
                    "tracking_id": native_id or (text_hash_id(text) if text else None),
                },
                "permalink": find_permalink(article),
                "timestamp": {
                    "raw": label,
                    "parsed": published.astimezone(LOCAL_TZ).isoformat() if published else None,
                    "labelled_spans": len(spans),
                    "labels_resolved": sum(1 for sp in spans if soup.find(id=sp.get("aria-labelledby")) is not None),
                },
                "counts": {
                    "reactions": {"beside_button": beside, "labels_disagree": conflict},
                    "comments": (buttons["comment_button"]["near"] or {}).get("count"),
                    "shares": (buttons["share_button"]["near"] or {}).get("count"),
                    "buttons": buttons,
                    "labels": labels,
                    "short_texts": short[:20],
                },
            }
        )

    return out


# ---------------------------------------------------------------- browser


def apply_stealth(context, page) -> None:
    """Apply playwright-stealth if installed. Both its API generations are tried."""
    try:
        from playwright_stealth import Stealth  # 2.x

        Stealth().apply_stealth_sync(context)
        log.info("playwright-stealth applied (2.x API).")
        return
    except ImportError:
        pass
    except Exception as e:  # noqa: BLE001
        log.warning("playwright-stealth 2.x failed and was skipped: %s", e)
        return
    try:
        from playwright_stealth import stealth_sync  # 1.x

        stealth_sync(page)
        log.info("playwright-stealth applied (1.x API).")
    except ImportError:
        log.warning("playwright-stealth is not installed. Continuing without it.")
    except Exception as e:  # noqa: BLE001
        log.warning("playwright-stealth 1.x failed and was skipped: %s", e)


def context_options(cfg: dict, headless: bool) -> dict:
    # The user agent is left as the browser's own unless overridden. A spoofed
    # string that disagrees with the real engine is easier to spot than the
    # truth.
    #
    # A visible window uses its own size. Forcing a fixed viewport into it drew
    # Facebook's login page shrunken and impossible to scroll on 2026-10-04.
    options = {"locale": "en-US", "timezone_id": "Asia/Bangkok"}
    if headless:
        options["viewport"] = VIEWPORT
    else:
        options["no_viewport"] = True
    if cfg["user_agent"]:
        options["user_agent"] = cfg["user_agent"]
    return options


def open_session(pw, cfg: dict, cookies: list[dict] | None, headless: bool):
    """
    Open the browser. Returns (browser, context, page). With the dedicated
    profile there is no separate browser object, so browser is None.
    """
    # Playwright turns Chrome's sandbox off unless told otherwise, and Chrome
    # then warns about --no-sandbox. A session is never logged in without it.
    launch = {"headless": headless, "chromium_sandbox": True}
    if not headless:
        launch["args"] = ["--start-maximized"]
    if cfg["channel"]:
        launch["channel"] = cfg["channel"]
    options = context_options(cfg, headless)
    try:
        if cookies is not None:
            browser = pw.chromium.launch(**launch)
            context = browser.new_context(**options)
            context.add_cookies(cookies)
            page = context.new_page()
        else:
            browser = None
            context = pw.chromium.launch_persistent_context(str(PROFILE_DIR), **launch, **options)
            page = context.pages[0] if context.pages else context.new_page()
    except PlaywrightError as e:
        raise ScrapeError(
            f"The browser did not start: {str(e).splitlines()[0]} "
            "If a window from an earlier run is still open on this profile, close it.",
            EXIT_OTHER,
        ) from None
    apply_stealth(context, page)
    return browser, context, page


def close_session(pw, browser, context) -> None:
    # Each close is separate so one failure cannot leave the rest open.
    for name, closer in (
        ("context", context.close if context else None),
        ("browser", browser.close if browser else None),
        ("playwright", pw.stop if pw else None),
    ):
        if closer is None:
            continue
        try:
            closer()
        except Exception as e:  # noqa: BLE001
            log.error("Closing the %s failed: %s", name, e)


def setup_login(cfg: dict) -> int:
    """
    Open the dedicated profile for a manual login. Nothing on the page is read.
    The only thing checked is whether the session cookies exist, by name. Their
    values are never read into a variable that is logged or written.
    """
    pw = context = None
    try:
        pw = sync_playwright().start()
        _, context, page = open_session(pw, cfg, None, headless=False)
        try:
            page.goto("https://www.facebook.com/", wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        except PlaywrightError as e:
            raise ScrapeError(f"Facebook failed to resolve or load: {str(e).splitlines()[0]}", EXIT_FACEBOOK) from None

        log.info("Log in to Facebook by hand in the window that opened. Waiting up to %d minutes.", SETUP_TIMEOUT_S // 60)
        deadline = time.time() + SETUP_TIMEOUT_S
        last_state = None
        while time.time() < deadline:
            try:
                # Any tab counts. A login finished in a second tab is still a
                # login, and the first tab may have been closed by hand.
                open_pages = [p for p in context.pages if not p.is_closed()]
                if not open_pages:
                    break
                names = {c["name"] for c in context.cookies()} & {"c_user", "xs"}
                paths = sorted({urlparse(p.url).path or "/" for p in open_pages})
            except PlaywrightError:
                break

            # Names and URL paths only. Never a cookie value or a query string.
            state = (tuple(sorted(names)), tuple(paths))
            if state != last_state:
                log.info("Session cookies present: %s. Open pages: %s", ", ".join(sorted(names)) or "none", ", ".join(paths))
                last_state = state

            mid_login = any(p.startswith(("/login", "/checkpoint", "/two_step", "/two_factor")) for p in paths)
            if names == {"c_user", "xs"} and not mid_login:
                log.info("Logged in. Saving the session and closing in 5 seconds.")
                time.sleep(5)
                return EXIT_OK
            time.sleep(2)

        if last_state and set(last_state[0]) == {"c_user", "xs"}:
            log.info("The window was closed with a session present. It is saved in the profile.")
            return EXIT_OK
        log.error("Setup ended without a logged in session. Run --setup again.")
        return EXIT_SESSION
    finally:
        close_session(pw, None, context)


def save_debug_html(name: str, html: str) -> None:
    """
    Save markup for offline inspection, in the git-ignored debug folder. Scripts
    are removed first: they carry request tokens, and nothing in them is needed.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "link", "noscript"]):
        tag.decompose()
    DEBUG_DIR.mkdir(exist_ok=True)
    (DEBUG_DIR / f"{name}.html").write_text(str(soup), encoding="utf-8")


def session_rejected(page) -> str | None:
    url = page.url
    if "/login" in url or "checkpoint" in url:
        return f"Facebook redirected to {urlparse(url).path}"
    if page.locator('input[name="pass"]').count() > 0:
        return "Facebook is showing a login form"
    return None


def expand_see_more(scope, pos: int) -> None:
    buttons = scope.locator('[data-ad-rendering-role="story_message"] [role="button"]').filter(has_text="See more")
    for i in range(buttons.count()):
        try:
            buttons.nth(i).click(timeout=3000)
            time.sleep(random.uniform(0.4, 0.9))
        except PlaywrightError as e:
            log.warning("Post %d: could not expand, its text will be the short version: %s", pos, str(e).splitlines()[0])


# The timestamp label lives outside the post, so it is fetched with it.
READ_POST_JS = """el => {
  const ids = [...el.querySelectorAll('a[href] [aria-labelledby]')].map(s => s.getAttribute('aria-labelledby'));
  const labels = [...new Set(ids)].map(i => document.getElementById(i)).filter(Boolean).map(n => n.outerHTML);
  return {article: el.outerHTML, labels};
}"""


def read_post(page, pos: int) -> tuple[str | None, str]:
    """
    Bring one post position on screen, wait for it to fill in, and return its
    HTML with a status: "rendered", "unrendered", or the reason it was not read.
    """
    post = page.locator(f'[aria-posinset="{pos}"]')
    deadline = time.time() + STALL_WAIT_S
    while post.count() == 0:
        if time.time() > deadline:
            slow = page.get_by_text("This is taking longer than expected").count() > 0
            return None, "the feed did not load it" + (' and shows "This is taking longer than expected"' if slow else "")
        page.mouse.wheel(0, random.randint(500, 900))
        time.sleep(random.uniform(1.0, 1.8))

    rendered = False
    deadline = time.time() + RENDER_WAIT_S
    while time.time() < deadline:
        try:
            post.first.scroll_into_view_if_needed(timeout=3000)
        except PlaywrightError:
            page.mouse.wheel(0, 400)
        if post.locator("[data-ad-rendering-role]").count() > 0:
            rendered = True
            break
        time.sleep(0.7)

    time.sleep(random.uniform(*POST_PAUSE))
    if rendered:
        # The timestamp label attaches a little after the post fills in, and on
        # some posts never does. The Content Library date is the exact one.
        deadline = time.time() + 3
        while time.time() < deadline and post.locator("a[href] [aria-labelledby]").count() == 0:
            time.sleep(0.5)
        expand_see_more(post, pos)
    try:
        data = post.first.evaluate(READ_POST_JS)
    except PlaywrightError as e:
        return None, f"could not be read: {str(e).splitlines()[0]}"
    html = f'<div hidden>{"".join(data["labels"])}</div>{data["article"]}'
    return html, "rendered" if rendered else "unrendered"


def scrape(cfg: dict, cookies: list[dict] | None) -> dict:
    collected: dict[str, dict] = {}
    probed: dict[str, dict] = {}
    profile: dict = {}
    steps: list[dict] = []
    pw = browser = context = None

    try:
        pw = sync_playwright().start()
        browser, context, page = open_session(pw, cfg, cookies, headless=cfg["headless"])
        renew = "Export the cookies again." if cookies is not None else "Run --setup and log in again."

        try:
            page.goto(cfg["profile_url"], wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        except PlaywrightTimeout:
            raise ScrapeError(f"Facebook did not respond within {NAV_TIMEOUT_MS // 1000}s.", EXIT_FACEBOOK) from None
        except PlaywrightError as e:
            raise ScrapeError(f"Facebook failed to resolve or load: {str(e).splitlines()[0]}", EXIT_FACEBOOK) from None

        reason = session_rejected(page)
        if reason:
            raise ScrapeError(f"{reason}. The session is no longer accepted. {renew}", EXIT_SESSION)

        try:
            page.wait_for_selector("[aria-posinset]", timeout=FEED_TIMEOUT_MS)
        except PlaywrightTimeout:
            reason = session_rejected(page)
            if reason:
                raise ScrapeError(f"{reason}. {renew}", EXIT_SESSION) from None
            raise ScrapeError(
                f"The profile loaded but no post appeared within {FEED_TIMEOUT_MS // 1000}s. "
                "Either the feed stalled or Facebook changed its markup.",
                EXIT_FACEBOOK,
            ) from None

        if cfg["probe"]:
            profile = probe_profile(BeautifulSoup(page.content(), "html.parser"))

        skipped_total = {"no_id": 0, "unrendered": 0}
        for pos in range(1, MAX_POSTS + 1):
            html, status = read_post(page, pos)
            if html is None:
                log.warning("Post %d: %s. Stopping here.", pos, status)
                steps.append({"position": pos, "status": status})
                break

            now = datetime.now(timezone.utc)
            posts, skipped = parse_posts(html, now)
            for reason, n in skipped.items():
                skipped_total[reason] += n
            for post in posts:
                # Keep the first read of a post. A second copy under the same
                # ID is reported by the probe as a duplicate.
                collected.setdefault(post["tracking_id"], post)
            log.info("Post %d of %d: %s%s.", pos, MAX_POSTS, status, "" if posts else ", nothing collected")

            if cfg["dump"]:
                save_debug_html(f"post_{pos:02d}", html)
            if cfg["probe"]:
                for p in probe_posts(html, now):
                    probed[p["posinset"]] = p
                steps.append({"position": pos, "status": status})

        library = collect_library(page)
        audience = collect_audience(page)

        if skipped_total["no_id"]:
            log.warning("%d posts had neither an ID nor a caption and were skipped.", skipped_total["no_id"])
        if skipped_total["unrendered"]:
            log.warning("%d post positions never filled in and were not read.", skipped_total["unrendered"])

        report = None
        if cfg["probe"]:
            ordered = sorted(probed.values(), key=lambda p: int(p["posinset"] or 0))
            ids = [p["id"]["tracking_id"] for p in ordered if p["id"]["tracking_id"]]
            report = {
                "probed_at": datetime.now(LOCAL_TZ).isoformat(),
                "steps": steps,
                "profile": profile or {"follower_mentions": []},
                "duplicate_tracking_ids": sorted({i for i in ids if ids.count(i) > 1}),
                "reaction_conflicts": [p["posinset"] for p in ordered if p["counts"]["reactions"]["labels_disagree"]],
                "posts": ordered,
            }
        return {"posts": list(collected.values()), "report": report, "library": library, "audience": audience}

    finally:
        close_session(pw, browser, context)


# ---------------------------------------------------------------- payload
#
# Contract 2, read by lib/personal-ingest.ts. One payload is one collection.

CONTRACT = 2
PERIOD = re.compile(r"^Last \d+ days: ([A-Za-z]{3,9} \d{1,2}) - ([A-Za-z]{3,9} \d{1,2})$")
TIMELINE_LABELS = (("reactions_total", "Reactions"), ("comments", "Comments"), ("shares", "Shares"))


def parse_period(label: str | None, now: datetime) -> tuple[str | None, str | None]:
    """ "Last 28 days: Sep 6 - Oct 4" as two ISO dates. The label carries no year. """
    m = PERIOD.match(" ".join((label or "").split()))
    if not m:
        return None, None
    today = now.astimezone(LOCAL_TZ).date()

    def day(text: str, year: int):
        for fmt in ("%b %d %Y", "%B %d %Y"):
            try:
                return datetime.strptime(f"{text} {year}", fmt).date()
            except ValueError:
                continue
        return None

    end = day(m.group(2), today.year)
    if end is None:
        return None, None
    if end > today + timedelta(days=1):
        end = day(m.group(2), today.year - 1)
    start = day(m.group(1), end.year)
    if start is None:
        return None, None
    if start > end:
        start = day(m.group(1), end.year - 1)
    return start.isoformat(), end.isoformat()


def same_caption(text: str | None, title: str | None) -> bool:
    """
    Whether a timeline caption and a library title open the same way. Only
    letters and digits are compared: the timeline renders emoji as images, so
    they are missing from its text and present in the library's.
    """
    a = re.sub(r"[^a-z0-9]", "", (text or "").lower())
    b = re.sub(r"[^a-z0-9]", "", (title or "").lower())
    n = min(30, len(a), len(b))
    return n >= 12 and a[:n] == b[:n]


def time_tolerance(label: str) -> timedelta:
    """How far a timeline label can sit from the exact time and still agree with it."""
    m = RELATIVE.match(" ".join(label.replace("\u00a0", " ").split()))
    if not m:
        return timedelta(minutes=2)  # an absolute label, to the minute
    return {
        "m": timedelta(minutes=90),
        "h": timedelta(minutes=90),
        "d": timedelta(hours=26),  # "2 days ago" is anywhere from 2 to 3 days
        "w": timedelta(days=8),
    }[m.group(2).lower()[0]]


def match_library(post: dict, rows: list[dict]) -> tuple[dict | None, str | None, str | None]:
    """
    Find the library row for a timeline post. Returns (row, how, reason).

    The post ID decides it when the timeline has one. A caption is only
    accepted when exactly one row agrees on caption, format and publish time.
    Anything else is returned with the reason and is reported, never merged.
    """
    by_id = {r["tracking_id"]: r for r in rows}
    if post["tracking_id"] in by_id:
        return by_id[post["tracking_id"]], "id", None
    if post["tracking_id"].startswith("p"):
        return None, None, None  # a real post ID with no library row: outside the window

    if not post["text"]:
        return None, None, "no post ID and no caption to match on"
    hits = [r for r in rows if r["kind"] == "post" and same_caption(post["text"], r["title"])]
    if not hits:
        return None, None, "no post ID, and no library row opens with this caption"
    is_video = lambda r: r["metrics"].get("Watch time", {}).get("value") is not None  # noqa: E731
    hits = [r for r in hits if is_video(r) == post["is_video"]]
    if not hits:
        return None, None, "caption matched, but not a row of the same format"
    if not post["published_at"] or not post["timestamp_raw"]:
        return None, None, f"caption and format matched {len(hits)} row(s), but the timeline showed no publish time"
    seen = datetime.fromisoformat(post["published_at"])
    tolerance = time_tolerance(post["timestamp_raw"])
    hits = [r for r in hits if r["published_at"] and abs(datetime.fromisoformat(r["published_at"]) - seen) <= tolerance]
    if len(hits) == 1:
        return hits[0], "caption", None
    return None, None, f"caption, format and publish time matched {len(hits)} rows"


def check_timezone(pairs: list[tuple[dict, dict]], rows: list[dict], now: datetime) -> dict:
    """
    The Content Library shows clock times with no zone. They are converted
    with LOCAL_TZ, which is right only if the browser displayed them in it.
    A timeline label counted in minutes or hours is zone free, so wherever a
    post has both, the two are compared. A publish time in the future is the
    other sign of a wrong zone.
    """
    future = [r["tracking_id"] for r in rows if r["published_at"] and datetime.fromisoformat(r["published_at"]) > now + timedelta(minutes=5)]
    checked, worst = 0, 0.0
    for post, row in pairs:
        m = RELATIVE.match(" ".join((post["timestamp_raw"] or "").replace("\u00a0", " ").split()))
        if not m or m.group(2).lower()[0] not in ("m", "h") or not row["published_at"] or not post["published_at"]:
            continue
        diff = abs(datetime.fromisoformat(post["published_at"]) - datetime.fromisoformat(row["published_at"]))
        checked += 1
        worst = max(worst, diff.total_seconds() / 60)
    if future or worst > 90:
        status = "inconsistent"
    else:
        status = "consistent" if checked else "unverified"
    return {"status": status, "posts_compared": checked, "largest_gap_minutes": round(worst), "future_times": len(future)}


def build_payload(result: dict, profile_url: str, now: datetime | None = None) -> dict:
    """
    Merge the three sources into one collection. Posts are identified by the
    post or story ID from the Content Library. A null anywhere is unknown.
    """
    now = now or datetime.now(timezone.utc)
    library = result["library"]
    audience = result["audience"]
    rows = (library or {}).get("rows", [])

    lib_start, lib_end = parse_period((library or {}).get("period_label"), now)
    aud_start, aud_end = parse_period((audience or {}).get("period_label"), now)
    library_ok = bool(rows) and "Views" in (library or {}).get("columns", []) and lib_start is not None
    total = (audience or {}).get("Total followers")
    audience_ok = bool(total and total["exact"]) and aud_start is not None
    timeline_ok = bool(result["posts"])
    if not library_ok:
        rows = []

    posts: dict[str, dict] = {}
    observations: list[dict] = []
    unmatched: list[dict] = []

    for r in rows:
        story = r["kind"] == "story"
        captionless = r["title"] == "No text content"
        posts[r["tracking_id"]] = {
            "tracking_id": r["tracking_id"],
            "kind": r["kind"],
            "format": "story" if story else None,
            # A story's title is "Photo story" or "Video story", not a caption.
            # Whether a library title is the whole caption is not known.
            "caption": None if story or captionless else r["title"],
            "caption_complete": None,
            "published_at": r["published_at"],
            "published_label": r["published_label"],
            "permalink": None,
            "timeline_id": None,
            "in_library": True,
            "on_timeline": False,
        }
        for label, m in r["metrics"].items():
            observations.append(
                {
                    "tracking_id": r["tracking_id"],
                    "source": "library",
                    "label": label,
                    **m,
                    "period_label": library["period_label"],
                    "period_start": lib_start,
                    "period_end": lib_end,
                }
            )

    pairs = []
    for t in result["posts"]:
        row, how, reason = match_library(t, rows)
        if row is None and not t["tracking_id"].startswith("p"):
            unmatched.append({"source": "timeline", "id": t["tracking_id"], "reason": reason})
            continue
        if row is not None:
            pairs.append((t, row))
        tracking_id = row["tracking_id"] if row else t["tracking_id"]
        post = posts.setdefault(
            tracking_id,
            {
                "tracking_id": tracking_id,
                "kind": "post",
                "format": None,
                "caption": None,
                "caption_complete": None,
                "published_at": None,  # the exact time only ever comes from the library
                "published_label": None,
                "permalink": None,
                "timeline_id": None,
                "in_library": False,
                "on_timeline": False,
            },
        )
        post["on_timeline"] = True
        post["permalink"] = t["permalink"]
        post["timeline_id"] = t["tracking_id"] if t["tracking_id"] != tracking_id else None
        post["match"] = how
        if not t["truncated"]:
            # The timeline rendered the whole post, so this is the caption,
            # including the case where there is none.
            post["caption"], post["caption_complete"] = t["text"], True
        elif t["text"] and len(t["text"]) > len(post["caption"] or ""):
            post["caption"], post["caption_complete"] = t["text"], False
        else:
            post["caption_complete"] = False

        counts = t["counts"]
        for key, label in TIMELINE_LABELS:
            c = counts[key]
            observations.append(timeline_observation(tracking_id, label, c))
        for kind, c in (counts["reactions_by_type"] or {}).items():
            observations.append(timeline_observation(tracking_id, f"Reactions: {kind.capitalize()}", c))

    if audience_ok:
        for label in ("Total followers", "Net follows", "Unfollows"):
            c = audience.get(label)
            observations.append(
                {
                    "tracking_id": None,
                    "source": "audience",
                    "label": label,
                    "raw": c["raw"] if c else None,
                    "value": c["value"] if c else None,
                    "unit": "count" if c else None,
                    "exact": c["exact"] if c else None,
                    "period_label": audience["period_label"],
                    "period_start": aud_start,
                    "period_end": aud_end,
                }
            )

    def state(ok: bool, label: str | None = None, start: str | None = None, end: str | None = None) -> dict:
        return {
            "status": "ok" if ok else "failed",
            "period_label": label if ok else None,
            "period_start": start if ok else None,
            "period_end": end if ok else None,
        }

    return {
        "contract": CONTRACT,
        "collection_id": str(uuid.uuid4()),
        "collected_at": now.isoformat(),
        "collected_on": now.astimezone(LOCAL_TZ).date().isoformat(),
        "timezone": str(LOCAL_TZ),
        "timezone_check": check_timezone(pairs, rows, now)["status"],
        "timezone_detail": check_timezone(pairs, rows, now),
        "profile_url": profile_url,
        "sources": {
            "timeline": state(timeline_ok),
            "library": state(library_ok, (library or {}).get("period_label"), lib_start, lib_end),
            "audience": state(audience_ok, (audience or {}).get("period_label"), aud_start, aud_end),
        },
        "posts": list(posts.values()),
        "observations": observations,
        "followers": total if audience_ok else None,
        "unmatched": unmatched,
    }


def timeline_observation(tracking_id: str, label: str, c: dict | None) -> dict:
    """A figure shown on the timeline. A blank is kept as a row with no value."""
    return {
        "tracking_id": tracking_id,
        "source": "timeline",
        "label": label,
        "raw": c["raw"] if c else None,
        "value": c["value"] if c else None,
        "unit": "count" if c else None,
        "exact": c["exact"] if c else None,
        "period_label": None,
        "period_start": None,
        "period_end": None,
    }


def summarize(payload: dict) -> None:
    """Log what the collection holds, so a run can be checked by eye."""
    figures: dict[tuple, dict] = {(o["tracking_id"], o["source"], o["label"]): o for o in payload["observations"]}
    show = lambda tid, source, label: (figures.get((tid, source, label)) or {}).get("raw") or "unknown"  # noqa: E731

    for name, source in payload["sources"].items():
        log.info("Source %s: %s%s", name, source["status"], f", {source['period_label']}" if source["period_label"] else "")
    for p in payload["posts"]:
        if not p["on_timeline"]:
            continue
        tid = p["tracking_id"]
        log.info(
            "%s | %s | reactions %s, comments %s, shares %s | %s",
            f"{tid[0]}...{tid[-4:]}",
            (p["caption"] or "(no caption)")[:30].replace("\n", " "),
            show(tid, "timeline", "Reactions"),
            show(tid, "timeline", "Comments"),
            show(tid, "timeline", "Shares"),
            f"views {show(tid, 'library', 'Views')}, viewers {show(tid, 'library', 'Viewers')}, "
            f"{p['published_label']} (matched by {p.get('match')})"
            if p["in_library"]
            else "no library row",
        )
    for u in payload["unmatched"]:
        log.warning("Not merged: %s %s...%s: %s", u["source"], u["id"][0], u["id"][-4:], u["reason"])

    posts = payload["posts"]
    log.info(
        "Posts: %d (%d stories). On the timeline: %d. In the library: %d. In both: %d. Not merged: %d. Observations: %d.",
        len(posts),
        sum(p["kind"] == "story" for p in posts),
        sum(p["on_timeline"] for p in posts),
        sum(p["in_library"] for p in posts),
        sum(p["on_timeline"] and p["in_library"] for p in posts),
        len(payload["unmatched"]),
        len(payload["observations"]),
    )
    log.info(
        "Captions: %d complete, %d truncated, %d unknown.",
        sum(p["caption_complete"] is True for p in posts),
        sum(p["caption_complete"] is False for p in posts),
        sum(p["caption_complete"] is None for p in posts),
    )
    log.info(
        "Audience: total followers %s, net follows %s, unfollows %s.",
        show(None, "audience", "Total followers"),
        show(None, "audience", "Net follows"),
        show(None, "audience", "Unfollows"),
    )
    log.info("Timezone check: %s", payload["timezone_detail"])


# ---------------------------------------------------------------- dashboard


def push_to_dashboard(payload: dict, ingest_url: str | None = None, secret: str | None = None) -> bool:
    """
    POST one collection to /api/ingest/personal. Returns True only when the
    dashboard stored it, or confirmed it had already stored this same payload.

    The body is serialised the same way every time, so sending a saved payload
    again produces identical bytes and the dashboard recognises it as a retry.
    """
    ingest_url = ingest_url or os.environ.get("INGEST_URL", "")
    secret = secret or os.environ.get("PERSONAL_INGEST_SECRET", "")
    body = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    try:
        response = requests.post(
            ingest_url,
            data=body,
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
            timeout=PUSH_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        log.error("Dashboard connection timed out after %ss connect, %ss read.", *PUSH_TIMEOUT)
        return False
    except requests.exceptions.ConnectionError as e:
        log.error("Dashboard could not be reached: %s", type(e).__name__)
        return False
    except requests.exceptions.RequestException as e:
        log.error("Dashboard request failed: %s", type(e).__name__)
        return False

    try:
        answer = response.json()
    except ValueError:
        log.error("Dashboard returned HTTP %d and a body that is not JSON.", response.status_code)
        return False

    if response.status_code != 200 or not answer.get("ok"):
        log.error("Dashboard refused the collection: HTTP %d, %s", response.status_code, answer.get("error", answer))
        for err in answer.get("errors", []):
            log.error("  %s", err)
        if answer.get("reason"):
            log.error("  %s", answer["reason"])
        return False

    if answer.get("retry"):
        log.info("Dashboard already had this collection. Nothing was written again.")
        return True
    written = answer.get("written") or {}
    log.info("Dashboard stored %s posts and %s observations.", written.get("posts"), written.get("observations"))
    followers = str(written.get("followers"))
    (log.warning if followers.startswith("skipped") else log.info)("Followers: %s", followers)
    return True


# ---------------------------------------------------------------- main


def main() -> int:
    setup_logging()
    try:
        cfg = load_config()
        if "--setup" in sys.argv:
            return setup_login(cfg)

        if cfg["resend"]:
            # The saved payload keeps its collection_id, so this is a retry of
            # that run and never a new collection.
            if not LAST_PAYLOAD_FILE.exists():
                raise ScrapeError(f"{LAST_PAYLOAD_FILE.name} does not exist. There is nothing to send again.", EXIT_CONFIG)
            payload = json.loads(LAST_PAYLOAD_FILE.read_text(encoding="utf-8"))
            log.info("Sending the saved collection %s again.", payload.get("collection_id"))
            return EXIT_OK if push_to_dashboard(payload, cfg["ingest_url"], cfg["secret"]) else EXIT_PUSH

        if cfg["use_cookies"]:
            cookies = load_cookies()
        else:
            cookies = None
            if not PROFILE_DIR.exists():
                raise ScrapeError(
                    "No saved session. Run scrape.py --setup once and log in by hand, "
                    "or pass --cookies to use cookies.json.",
                    EXIT_COOKIES,
                )
        log.info("Reading %s%s", cfg["profile_url"], " (probe)" if cfg["probe"] else "")
        result = scrape(cfg, cookies)
        report = result["report"]

        if report is not None:
            PROBE_FILE.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
            log.info(
                "Probe: %d positions read, %d rendered, %d follower mentions, %d duplicate IDs, "
                "%d posts with conflicting reaction figures. Written to %s",
                len(report["posts"]),
                sum(1 for p in report["posts"] if p["rendered"]),
                len(report["profile"]["follower_mentions"]),
                len(report["duplicate_tracking_ids"]),
                len(report["reaction_conflicts"]),
                PROBE_FILE.name,
            )
            return EXIT_OK

        for p in result["posts"]:
            if p["timestamp_raw"] is not None and p["published_at"] is None:
                log.warning("Post %s: timeline timestamp not understood: %r", p["tracking_id"], p["timestamp_raw"])
        for r in (result["library"] or {}).get("rows", []):
            if r["published_at"] is None:
                log.warning("Library row %s: publish time not understood: %r", r["tracking_id"], r["published_label"])

        payload = build_payload(result, cfg["profile_url"])
        summarize(payload)

        if all(s["status"] == "failed" for s in payload["sources"].values()):
            raise ScrapeError("No source could be read. Nothing was saved or sent.", EXIT_NO_POSTS)
        if payload["timezone_check"] == "inconsistent":
            raise ScrapeError(
                "Publish times disagree with the timezone they were converted in. Nothing was saved or sent.",
                EXIT_TIMEZONE,
            )
        failed = [name for name, s in payload["sources"].items() if s["status"] == "failed"]
        if failed:
            log.warning("Sources that failed and contribute nothing to this collection: %s.", ", ".join(failed))

        text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
        if cfg["dry_run"]:
            DRY_RUN_FILE.write_text(text, encoding="utf-8")
            log.info("Dry run. Nothing sent. Payload written to %s", DRY_RUN_FILE.name)
            return EXIT_OK

        # Saved before sending, so a failed push can be repeated with --resend
        # as the same collection instead of scraping again.
        LAST_PAYLOAD_FILE.write_text(text, encoding="utf-8")
        if not push_to_dashboard(payload, cfg["ingest_url"], cfg["secret"]):
            log.error("Not stored. Run scrape.py --resend to send this same collection again.")
            return EXIT_PUSH
        return EXIT_OK

    except ScrapeError as e:
        log.error("%s", e)
        return e.code
    except KeyboardInterrupt:
        log.error("Interrupted.")
        return EXIT_OTHER
    except Exception:  # noqa: BLE001
        log.exception("Unexpected failure.")
        return EXIT_OTHER


if __name__ == "__main__":
    sys.exit(main())
