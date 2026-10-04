"""
Runs the scraper when the dashboard's button asks for it. On demand only.

The "Collect Facebook profile" button on the Sync page cannot start the
scraper itself, because the scraper needs the logged in Chrome profile on this
laptop. So the button does two things: it writes a request, and it opens a
qylat-collect: link. Windows hands that link to this script, once
register-protocol.ps1 has been run. Nothing runs between presses.

When it is opened, this script:
  1. Asks /api/ingest/personal/runs to claim the request. No request waiting:
     it says so and stops. Facebook is not touched.
  2. Runs scrape.py in this window, stopped after 20 minutes.
  3. Reports the exit code and the last lines scrape.py logged, which the
     Sync page then shows.

Step 1 is what makes the link safe. Any web page can open a qylat-collect:
link, and nothing in the link is trusted or used. The scraper runs only when
there is a request to claim, and only a press on the logged in Sync page, in
the last few minutes, writes one.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

import requests

from scrape import LOG_FILE, ROOT, load_env

COLLECT_LOG = ROOT / "collect.log"
TIMEOUT = (10, 30)  # connect, read
RUN_LIMIT_S = 20 * 60
DETAIL_LINES = 6

log = logging.getLogger("personal-fb-collect")


def setup_logging() -> None:
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    file = RotatingFileHandler(COLLECT_LOG, maxBytes=200_000, backupCount=2, encoding="utf-8")
    file.setFormatter(fmt)
    log.setLevel(logging.INFO)
    log.addHandler(file)
    if sys.stdout is not None:
        log.addHandler(logging.StreamHandler(sys.stdout))


def call(runs_url: str, secret: str, body: dict) -> dict | None:
    """One POST to the runs route. None, logged, when it did not answer ok."""
    try:
        r = requests.post(runs_url, json=body, headers={"Authorization": f"Bearer {secret}"}, timeout=TIMEOUT)
        answer = r.json()
    except (requests.exceptions.RequestException, ValueError) as e:
        log.error("Dashboard did not answer %s: %s", body["action"], type(e).__name__)
        return None
    if r.status_code != 200 or not answer.get("ok"):
        log.error("Dashboard refused %s: HTTP %d, %s", body["action"], r.status_code, answer.get("error", answer))
        return None
    return answer


def stop_tree(proc: subprocess.Popen) -> None:
    """
    Stop an overrunning scraper together with everything it started. Killing
    scrape.py alone leaves its Chrome open, and that window holds the profile
    folder, so every later run would fail to start its browser.
    """
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
    else:
        proc.kill()
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        log.error("The scraper did not stop. Close its window by hand before collecting again.")


def new_log_lines(start: int) -> list[str]:
    """What scrape.py added to scrape.log during this run, without timestamps."""
    try:
        data = LOG_FILE.read_bytes()
    except OSError:
        return []
    # The log rotates at 500 KB. If it shrank, the run's lines start the new file.
    chunk = data[start:] if len(data) >= start else data
    lines = chunk.decode("utf-8", errors="replace").splitlines()
    return [re.sub(r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d+ ", "", l) for l in lines if l.strip()]


def close_window(seconds: int, wait_for_key: bool) -> None:
    """Leave the result readable. A failure waits for a key, a success closes itself."""
    if sys.stdin is None or not sys.stdin.isatty():
        return
    if wait_for_key:
        try:
            input("\nPress Enter to close this window.")
        except EOFError:
            pass
    else:
        print(f"\nThis window closes in {seconds} seconds.")
        time.sleep(seconds)


def main() -> int:
    setup_logging()
    load_env()
    ingest_url = os.environ.get("INGEST_URL", "").strip().rstrip("/")
    secret = os.environ.get("PERSONAL_INGEST_SECRET", "").strip()
    if not ingest_url or not secret:
        log.error("INGEST_URL or PERSONAL_INGEST_SECRET is missing in .env.")
        close_window(0, wait_for_key=True)
        return 2
    runs_url = ingest_url + "/runs"

    answer = call(runs_url, secret, {"action": "claim"})
    if answer is None:
        close_window(0, wait_for_key=True)
        return 7
    if not answer.get("request"):
        log.info(
            "No collection is waiting. Nothing was run. A collection starts only from the "
            "Collect Facebook profile button on the dashboard's Sync page."
        )
        close_window(10, wait_for_key=False)
        return 0
    request_id = answer["request"]["id"]
    log.info("Request %s claimed. Running scrape.py. Do not click in the Chrome window while it works.", request_id)

    start = LOG_FILE.stat().st_size if LOG_FILE.exists() else 0
    try:
        proc = subprocess.Popen([sys.executable, str(ROOT / "scrape.py")], cwd=ROOT)
        try:
            code = proc.wait(timeout=RUN_LIMIT_S)
            lines = new_log_lines(start)
        except subprocess.TimeoutExpired:
            stop_tree(proc)
            code = 1
            lines = new_log_lines(start) + [f"Stopped by collect.py after {RUN_LIMIT_S // 60} minutes."]
    except OSError as e:
        code = 1
        lines = [f"scrape.py could not be started: {e}"]

    log.info("Request %s finished with exit code %s.", request_id, code)
    detail = "\n".join(lines[-DETAIL_LINES:])
    reported = call(runs_url, secret, {"action": "finish", "id": request_id, "exit_code": code, "detail": detail})
    if not reported:
        log.error("Request %s: the result could not be reported. The Sync page will show it as no result.", request_id)

    close_window(20, wait_for_key=code != 0 or not reported)
    return 0


if __name__ == "__main__":
    sys.exit(main())
