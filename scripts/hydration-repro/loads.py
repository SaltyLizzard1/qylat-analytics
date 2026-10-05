"""
Loads one page many times in a clean headless Chrome and counts hydration
failures. Started by repro.cjs, which passes everything through the
environment so the session value never appears on a command line.

A load counts as failed when React reports #418 or a hydration failure. As a
second signal, a document that was redrawn in the browser has no comment nodes
left, where a hydrated one keeps React's markers.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ["REPRO_BASE"]
PATH = os.environ["REPRO_PATH"]
RUNS = int(os.environ["REPRO_RUNS"])
SESSION = os.environ["REPRO_SESSION"]
SETTLE_MS = int(os.environ.get("REPRO_SETTLE_MS", "1500"))

READ = """() => {
  const H = window.__hyd;
  const it = document.createNodeIterator(document.documentElement, NodeFilter.SHOW_COMMENT);
  let comments = 0; while (it.nextNode()) comments++;
  return {comments, probe: !!H, startedAt: H && H.startedAt, readyAtStart: H && H.readyAtStart,
          errors: H ? H.errors : [], rows: document.querySelectorAll('main li').length,
          path: location.pathname};
}"""

failed = 0
unusable = 0
first_detail = None
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True)
    for i in range(RUNS):
        ctx = browser.new_context(viewport={"width": 1360, "height": 900})
        ctx.add_cookies([{"name": "analytics_auth", "value": SESSION, "url": BASE}])
        page = ctx.new_page()
        try:
            page.goto(BASE + PATH, wait_until="load", timeout=120000)
            page.wait_for_timeout(SETTLE_MS)
            r = page.evaluate(READ)
        except Exception as e:  # reported, never counted as a pass
            unusable += 1
            print(f"  load {i + 1:>3}: COULD NOT RUN  {str(e)[:160]}", flush=True)
            ctx.close()
            continue
        if not r["probe"] or r["startedAt"] is None or r["path"].startswith("/login"):
            unusable += 1
            print(f"  load {i + 1:>3}: UNUSABLE  probe={r['probe']} started={r['startedAt']} path={r['path']}", flush=True)
        elif r["errors"] or r["comments"] == 0:
            failed += 1
            e = r["errors"][0] if r["errors"] else {}
            if first_detail is None:
                first_detail = e
            print(f"  load {i + 1:>3}: FAILED  stopped after {e.get('stoppedAfter')}, expected {e.get('expected')} "
                  f"inside {e.get('parentNode')} (fiber {e.get('parentFiber')}), comment nodes left {r['comments']}", flush=True)
        else:
            print(f"  load {i + 1:>3}: ok  hydration began at {r['startedAt']} ms ({r['readyAtStart']})", flush=True)
        ctx.close()
    browser.close()

print("RESULT " + json.dumps({"runs": RUNS, "failed": failed, "unusable": unusable, "first": first_detail}))
sys.exit(0)
