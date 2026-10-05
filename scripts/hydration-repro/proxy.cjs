/**
 * Sits in front of a local `next start` and does two things to HTML pages:
 *
 *   1. Delivers the body late and in slices with gaps, the way a real network
 *      does. Hydration error #418 only shows when the page arrives in pieces,
 *      which localhost never does on its own.
 *   2. Adds one script at the top of <head> that records whether hydration
 *      failed and where React stopped. Read it from window.__hyd.
 *
 * Everything that is not HTML passes straight through.
 */
const http = require('http');

// Runs before any other script on the page. Plain ES5 on purpose.
const PROBE = `<script>(function(){
  var H = window.__hyd = {errors: [], startedAt: null, readyAtStart: null, els: null, t0: performance.now()};
  var T = function(){ return Math.round(performance.now() - H.t0); };
  var claimed = function(e){ for (var k in e) if (k.indexOf('__reactFiber') === 0) return true; return false; };
  var fiberOf = function(n){ for (var k in n) if (k.indexOf('__reactFiber') === 0) return n[k]; return null; };
  var desc = function(e){ if (!e || e.nodeType !== 1) return null; var p = [], x = e; for (var i = 0; i < 4 && x && x.nodeType === 1; i++) { p.unshift(x.tagName.toLowerCase() + (typeof x.className === 'string' && x.className ? '.' + x.className.split(' ')[0] : '')); x = x.parentNode; } return p.join('>'); };
  var started = function(){ var b = document.body; if (!b) return false; for (var i = 0; i < b.children.length; i++) if (claimed(b.children[i])) return true; return false; };
  new MutationObserver(function(){
    if (H.startedAt !== null) return;
    if (started()) { H.startedAt = T(); H.readyAtStart = document.readyState; }
    if (document.body) H.els = Array.prototype.slice.call(document.querySelectorAll('body, body *'));
  }).observe(document, {childList: true, subtree: true});
  var report = function(msg){
    var e = {t: T(), msg: String(msg).slice(0, 160), ready: document.readyState};
    try {
      if (H.els) {
        var last = -1; for (var i = 0; i < H.els.length; i++) if (claimed(H.els[i])) last = i;
        e.elements = H.els.length; e.completed = H.els.filter(claimed).length; e.stoppedAfter = desc(H.els[last]);
        var f = H.els[last] ? fiberOf(H.els[last]) : null;
        while (f && !f.sibling) f = f.return;
        var s = f ? f.sibling : null, guard = 0;
        while (s && s.child && guard++ < 80) s = s.child;
        if (s) {
          var props = s.pendingProps || {};
          e.expected = (typeof s.type === 'string' ? s.type : 'component') + (typeof props.className === 'string' ? '.' + props.className.split(' ')[0] : '');
          var par = s.return; while (par && !(par.stateNode && par.stateNode.nodeType === 1)) par = par.return;
          if (par) { e.parentNode = desc(par.stateNode); e.parentFiber = (typeof par.type === 'string' ? par.type : 'component') + (par.pendingProps && typeof par.pendingProps.className === 'string' ? '.' + par.pendingProps.className.split(' ')[0] : ''); e.parentNodeChildren = Array.prototype.slice.call(par.stateNode.children, 0, 5).map(function(c){ return c.tagName.toLowerCase(); }); }
        }
      }
    } catch (x) { e.walkFailed = String(x); }
    H.errors.push(e);
  };
  window.addEventListener('error', function(ev){ if (/418|ydrat/.test(String(ev.message))) report(ev.message); });
  var ce = console.error; console.error = function(){ try { var s = Array.prototype.map.call(arguments, function(a){ return (a && a.message) || String(a); }).join(' '); if (/#418|Hydration failed|hydrat.*mismatch/i.test(s)) report(s); } catch (x) {} return ce.apply(this, arguments); };
})();</script>`;

/**
 * @param {{listen:number,target:number,delayMs:number,sliceBytes:number,gapMs:number}} o
 * sliceBytes 0 sends the body in one piece, which is the control.
 */
function startProxy(o) {
  const server = http.createServer((req, res) => {
    const up = http.request(
      {
        host: 'localhost',
        port: o.target,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `localhost:${o.target}`, 'accept-encoding': 'identity' },
      },
      (r) => {
        const html = String(r.headers['content-type'] || '').includes('text/html');
        const headers = { ...r.headers };
        delete headers['content-length'];
        res.writeHead(r.statusCode, headers);
        if (!html) return r.pipe(res);
        // Headers at once, body held back, the way the deployed site answers.
        res.flushHeaders();
        const parts = [];
        r.on('data', (c) => parts.push(c));
        r.on('end', () => {
          const all = Buffer.from(Buffer.concat(parts).toString('utf8').replace('<head>', '<head>' + PROBE), 'utf8');
          setTimeout(() => {
            if (!o.sliceBytes) return res.end(all);
            let at = 0;
            const step = () => {
              if (at >= all.length) return res.end();
              res.write(all.subarray(at, at + o.sliceBytes));
              at += o.sliceBytes;
              setTimeout(step, o.gapMs);
            };
            step();
          }, o.delayMs);
        });
      }
    );
    up.on('error', () => {
      res.statusCode = 502;
      res.end();
    });
    req.pipe(up);
  });
  return new Promise((resolve) => server.listen(o.listen, () => resolve(server)));
}

module.exports = { startProxy };
