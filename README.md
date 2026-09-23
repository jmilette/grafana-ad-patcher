# grafana-noads

Hides Grafana Enterprise/Cloud upsell UI (nav "Stats and license", the
"Get Grafana Enterprise" page, dismissible ad cards, feature-highlight promo
tabs, and plugin "Enterprise" lock badges) from an unmodified
`grafana/grafana` OSS Docker image, without building a custom image and
without ever running the container as root.

Background: grafana/grafana#116721 asked for a config flag to disable these;
it was closed "not planned". None of this UI is gated by an ini setting or
feature toggle — it's unconditional React UI that renders based on
`edition === OpenSource` / no license, so it has to be patched at deploy
time instead. See how it works below.

Verified against Grafana **13.0.8**. If you bump the image tag, re-run
`extract-and-patch.sh` and re-check the UI (see Verifying below) — the
matching rules key off i18n strings, hrefs, and aria attributes that could
change between versions.

## How it works

Two files differ from the stock image, and both are pre-generated on the
**host**, not written by the container at runtime:

- `patched/index.html` — a copy of the image's `public/views/index.html`
  (Grafana's server-rendered HTML shell) with one extra line added before
  `</body>`: `<script src="public/img/hide-ads.js" defer>`.
- `hide-ads.js` — runs in the browser on every page load and every
  client-side (React Router) navigation. It matches known upsell elements —
  by stable attribute first, then link `href`, then exact rendered text as a
  last resort — and sets `display: none` on them. It fails open: if a rule's
  target text/markup changes in a future Grafana version, that one rule
  just stops matching (nothing breaks, the ad reappears) rather than erroring.

`docker-compose.yml` bind-mounts both files directly over their paths in the
container, read-only. There's no custom entrypoint and no `user:` override —
the container starts and runs exactly like the stock image (same non-root
`grafana` user throughout). Root is only ever used transiently, on your own
host, by `extract-and-patch.sh` to `docker cp` a file out of a
never-started container — the running Grafana server process is untouched.

(An earlier version of this used a custom entrypoint that patched files
inside the running container. That required starting the container as root
to get write access to `/usr/share/grafana/public`, and this image's
`/run.sh` has no privilege-drop step to bring it back down afterward —
Grafana would have kept running as root for its whole lifetime. The
pre-generate-and-mount approach avoids that: root is never in the loop for
the long-running process.)

## Setup

```bash
./extract-and-patch.sh grafana/grafana:13.0.8   # generates patched/index.html
docker compose up -d
```

or with plain `docker run`:

```bash
docker run -d \
  -p 3000:3000 \
  -v "$(pwd)/patched/index.html:/usr/share/grafana/public/views/index.html:ro" \
  -v "$(pwd)/hide-ads.js:/usr/share/grafana/public/img/hide-ads.js:ro" \
  -v grafana-data:/var/lib/grafana \
  grafana/grafana:13.0.8
```

## Verifying it worked

```bash
docker exec <container> id
# expect: uid=472(grafana) gid=0(root) — never root

curl -s http://localhost:3000/login | grep hide-ads
# expect: <script src="public/img/hide-ads.js" defer></script>
```

Then in the browser: Admin nav should no longer show "Stats and license";
Alerting home should have no ad card; Users/Teams admin pages should have no
"Enterprise authentication" card; enterprise-only plugin pages should have
no "Enterprise" lock badge or Cloud/Enterprise warning banner.

## Updating for a new Grafana version

1. Bump the image tag in `docker-compose.yml`.
2. Run `./extract-and-patch.sh <new-image-tag>` to regenerate
   `patched/index.html` from the new image.
3. Start it, click through: Admin nav, `/admin/upgrading` (nav link alone is
   hidden — the page itself still renders if visited directly, since
   hide-ads.js hides its content but doesn't block the route), Alerting
   home, Users admin, Teams admin, a datasource's Insights/Caching/Permissions
   tabs, an enterprise-only plugin's page.
4. For anything still showing, open browser devtools, find the element,
   and add/adjust a rule in `hide-ads.js` (see comments at the top of the
   file for the matching strategy used).
