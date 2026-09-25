// Optional status server. Not required for pixhub to work — it exists because
// "is my script broken or is the API down?" is the question you'll actually
// have, and the answer is much faster to read here than in container logs.
//
// It is unauthenticated by design (LAN tool). Do not expose it to the internet.

import { createServer } from 'node:http';

export function startServer({ config, store, screens, pusher, gatherer, device, log }) {
  const serverLog = log.child('http');

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const method = req.method || 'GET';

    try {
      if (method === 'GET' && pathname === '/healthz') return send(res, 200, { ok: true });
      if (method === 'GET' && pathname === '/') return sendHtml(res, 200, dashboardHtml());
      if (method === 'GET' && pathname === '/api/status') {
        return send(res, 200, buildStatus({ config, store, screens, pusher, device }));
      }

      const show = pathname.match(/^\/api\/screens\/([^/]+)\/show$/);
      if (method === 'POST' && show) {
        const ok = await pusher?.show(decodeURIComponent(show[1]));
        return send(res, ok ? 200 : 404, { ok: Boolean(ok) });
      }

      const refresh = pathname.match(/^\/api\/screens\/([^/]+)\/refresh$/);
      if (method === 'POST' && refresh) {
        const name = decodeURIComponent(refresh[1]);
        await gatherer?.refresh(name);
        return send(res, 200, { ok: true, screen: store.get(name) });
      }

      // The raw data behind a screen — the fastest way to work out why a
      // {{path}} isn't resolving. Resolved through the dataset, so a screen
      // sharing another's data shows that data rather than nothing.
      const data = pathname.match(/^\/api\/screens\/([^/]+)\/data$/);
      if (method === 'GET' && data) {
        const name = decodeURIComponent(data[1]);
        const screen = screens.find((s) => s.name === name);
        const record = store.get(screen?.dataset ?? name);
        return send(res, record ? 200 : 404, record ?? { error: 'no data' });
      }

      if (method === 'POST' && pathname === '/api/next') {
        await pusher?.next();
        return send(res, 200, { ok: true, current: pusher?.status.current ?? null });
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      serverLog.error(err);
      return send(res, 500, { error: err.message });
    }
  });

  server.listen(config.http.port, config.http.host, () => {
    serverLog.info(`status page on http://${config.http.host}:${config.http.port}`);
  });

  return server;
}

function buildStatus({ config, store, screens, pusher, device }) {
  const state = store.all();

  return {
    ok: true,
    mode: config.mode,
    bridge: device?.baseUrl ?? config.bridgeUrl,
    display: pusher?.status ?? null,
    brightness: config.brightness,
    screens: screens.map((screen) => {
      const record = state[screen.dataset] || {};
      return {
        name: screen.name,
        title: screen.title,
        dataset: screen.dataset,
        description: screen.description,
        script: screen.config.script || (screen.config.command || []).join(' ') || null,
        hasScript: screen.hasScript,
        refreshSeconds: Math.round(screen.refreshMs / 1000),
        durationSeconds: Math.round(screen.durationMs / 1000),
        brightness: screen.config.brightness ?? config.brightness,
        fetchedAt: record.fetchedAt ?? null,
        hasData: record.data != null,
        error: record.error ?? null,
        errorAt: record.errorAt ?? null,
        failures: record.failures ?? 0,
      };
    }),
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body, null, 2));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// Single self-contained page — no build step, no assets, no CDN.
function dashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pixhub</title>
<style>
  :root { color-scheme: dark; --bg:#0d1117; --card:#161b22; --line:#30363d; --fg:#e6edf3; --dim:#8b949e; --ok:#3fb950; --bad:#f85149; }
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem 1rem; background:var(--bg); color:var(--fg);
         font:15px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size:1.4rem; margin:0 0 .25rem; letter-spacing:.02em; }
  .sub { color:var(--dim); margin:0 0 1.5rem; font-size:.85rem; }
  .screen { background:var(--card); border:1px solid var(--line); border-radius:8px;
            padding:1rem; margin-bottom:.75rem; }
  .head { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
  .key { font-weight:600; }
  .tag { font-size:.7rem; color:var(--dim); border:1px solid var(--line);
         border-radius:999px; padding:.1rem .5rem; }
  .dot { width:.55rem; height:.55rem; border-radius:50%; flex:none; }
  .meta { color:var(--dim); font-size:.78rem; margin-top:.5rem; }
  .err { color:var(--bad); font-size:.78rem; margin-top:.4rem; word-break:break-word; }
  .live { border-color:var(--ok); }
  .alert { border:1px solid var(--bad); border-radius:8px; padding:.75rem 1rem;
           margin-bottom:1rem; color:var(--bad); font-size:.82rem; }
  .alert b { display:block; margin-bottom:.25rem; }
  button, a.btn { background:transparent; color:var(--fg); border:1px solid var(--line);
           border-radius:6px; padding:.25rem .6rem; font:inherit; font-size:.75rem;
           cursor:pointer; text-decoration:none; }
  button:hover, a.btn:hover { border-color:var(--fg); }
  .actions { margin-left:auto; display:flex; gap:.4rem; }
</style>
</head>
<body>
<main>
  <h1>pixhub</h1>
  <p class="sub" id="sub">loading…</p>
  <div id="alert"></div>
  <div id="screens"></div>
</main>
<script>
const post = (path) => fetch(path, { method: 'POST' }).then(load);

async function load() {
  const s = await (await fetch('/api/status')).json();
  const current = s.display?.current;
  document.getElementById('sub').textContent =
    \`mode \${s.mode} · bridge \${s.bridge} · showing \${current ?? 'nothing yet'}\`;

  // A failing render means the panel is frozen on whatever it last drew, even
  // though every script below may be perfectly healthy.
  const err = s.display?.error;
  document.getElementById('alert').innerHTML = err
    ? \`<div class="alert"><b>Nothing is reaching the display</b>
         Last failure \${new Date(err.at).toLocaleString()} on "\${esc(err.screen)}".<br>
         \${esc(err.message)}<br><br>
         The panel is still showing whatever it drew last. Check that the Pixoo
         is powered on and answering — a Divoom that drops its web server needs
         a power cycle.</div>\`
    : '';

  document.getElementById('screens').innerHTML = s.screens.map(p => {
    const ok = !p.hasScript || (p.hasData && !p.error);
    const enc = encodeURIComponent(p.name);
    return \`<div class="screen \${p.name === current ? 'live' : ''}">
      <div class="head">
        <span class="dot" style="background:\${ok ? 'var(--ok)' : 'var(--bad)'}"></span>
        <span class="key">\${esc(p.name)}</span>
        <span class="tag">\${esc(p.title)}</span>
        \${p.name === current ? '<span class="tag">on screen</span>' : ''}
        <span class="actions">
          <button onclick="post('/api/screens/\${enc}/show')">show</button>
          \${p.hasScript ? \`<button onclick="post('/api/screens/\${enc}/refresh')">run script</button>\` : ''}
          \${p.hasData ? \`<a class="btn" href="/api/screens/\${enc}/data" target="_blank">data</a>\` : ''}
        </span>
      </div>
      <div class="meta">\${p.hasScript
        ? \`\${esc(p.script)} · every \${p.refreshSeconds}s · shown \${p.durationSeconds}s · last run \${p.fetchedAt ? new Date(p.fetchedAt).toLocaleString() : 'never'}\`
        : \`\${p.dataset !== p.name ? 'reads "' + esc(p.dataset) + '"' : 'no script'} · shown \${p.durationSeconds}s\`}</div>
      \${p.error ? \`<div class="err">\${esc(p.error)}</div>\` : ''}
    </div>\`;
  }).join('');
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
load();
setInterval(load, 5000);
</script>
</body>
</html>`;
}
