"""
Runs the scraper when the dashboard asks for it.

The "Collect Facebook profile" button on the Sync page cannot start the
scraper itself, because the scraper needs the logged in Chrome profile on this
laptop. The button leaves a request; this script asks for it, and Task
Scheduler runs this script every 5 minutes while you are logged on
(register-task.ps1).

Each time it runs:
  1. Asks /api/ingest/personal/runs whether a request is waiting, and claims
     it if so. Nothing waiting: exits without a word. Facebook is not touched.
  2. Runs scrape.py, in its own console window, stopped after 20 minutes.
  3. Reports the exit code and the last lines scrape.py logged, which the
     Sync page then shows.

Runs under pythonw.exe, so no window flashes every 5 minutes. It logs to
poll.log, only when it claims a request or something goes wrong.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import requests

from scrape import LOG_FILE, ROOT, load_env

POLL_LOG = ROOT / "poll.log"
TIMEOUT = (10, 30)  # connect, read
RUN_LIMIT_S = 20 * 60
DETAIL_LINES = 6

log = logging.getLogger("personal-fb-poll")


def setup_logging() -> None:
    handler = RotatingFileHandler(POLL_LOG, maxBytes=200_000, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.setLevel(logging.INFO)
    log.addHandler(handler)
    # Under python.exe, for a run by hand, also print.
    if sys.stdout is not None:
        log.addHandler(logging.StreamHandler(sys.stdout))


def call(runs_url: str, secret: str, body: dict) -> dict | None:
    """One POST to the runs route. None, logged, when it did not answer ok."""
    try:
        r = requests.post(runs_url, json=body, headers={"Authorization": f"Bearer {secret}"}, timeout=TIMEOUT)
        answer = r.json()
    except (requests.exceptions.RequestException, ValueError) as e:
        log.warning("Dashboard did not answer %s: %s", body["action"], type(e).__name__)
        return None
    if r.status_code != 200 or not answer.get("ok"):
        log.error("Dashboard refused %s: HTTP %d, %s", body["action"], r.status_code, answer.get("error", answer))
        return None
    return answer


def scraper_python() -> str:
    """python.exe beside this pythonw.exe, so the scraper gets a console window."""
    exe = Path(sys.executable)
    console = exe.with_name("python.exe")
    return str(console if console.exists() else exe)


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


def main() -> int:
    setup_logging()
    load_env()
    ingest_url = os.environ.get("INGEST_URL", "").strip().rstrip("/")
    secret = os.environ.get("PERSONAL_INGEST_SECRET", "").strip()
    if not ingest_url or not secret:
        log.error("INGEST_URL or PERSONAL_INGEST_SECRET is missing in .env.")
        return 2
    runs_url = ingest_url + "/runs"

    answer = call(runs_url, secret, {"action": "claim"})
    if not answer or not answer.get("request"):
        return 0
    request_id = answer["request"]["id"]
    log.info("Request %s claimed. Running scrape.py.", request_id)

    start = LOG_FILE.stat().st_size if LOG_FILE.exists() else 0
    flags = subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0
    try:
        proc = subprocess.Popen([scraper_python(), str(ROOT / "scrape.py")], cwd=ROOT, creationflags=flags)
        try:
            code = proc.wait(timeout=RUN_LIMIT_S)
            lines = new_log_lines(start)
        except subprocess.TimeoutExpired:
            stop_tree(proc)
            code = 1
            lines = new_log_lines(start) + [f"Stopped by poll.py after {RUN_LIMIT_S // 60} minutes."]
    except OSError as e:
        code = 1
        lines = [f"scrape.py could not be started: {e}"]

    log.info("Request %s finished with exit code %s.", request_id, code)
    detail = "\n".join(lines[-DETAIL_LINES:])
    if not call(runs_url, secret, {"action": "finish", "id": request_id, "exit_code": code, "detail": detail}):
        log.error("Request %s: the result could not be reported. The Sync page will show it as no result.", request_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
