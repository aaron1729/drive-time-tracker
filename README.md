# Drive Time Tracker

Polls Google Maps driving time for one or more routes on a schedule and plots the history as a line chart per route on a GitHub Pages site.

## Setup

### 1. Add your API key

In your GitHub repo settings, go to **Settings → Secrets and variables → Actions** and add a secret named:

```
GOOGLE_MAPS_API_KEY
```

The key needs the **Routes API** enabled. No other APIs required.

### 2. Set your routes

Edit [`config.json`](config.json). It holds a list of routes, each with a unique `id` (used for its data filename), an `origin`, a `destination`, and a `label` shown on the chart:

```json
{
  "routes": [
    {
      "id": "home-to-work",
      "origin": "Your starting address",
      "destination": "Your ending address",
      "label": "Home → Work"
    }
  ]
}
```

Add as many routes as you like — each gets its own line chart. Any geocodable address string works (street address, landmark name, etc.).

### 3. Enable GitHub Pages

In repo settings, go to **Pages** and set the source to **Deploy from a branch → main → / (root)**.

The chart will be available at `https://<your-username>.github.io/<repo-name>/`.

## Scheduling

The workflow can be launched two ways, and both are enabled:

1. **GitHub's own `schedule` cron** in [`.github/workflows/fetch.yml`](.github/workflows/fetch.yml):

   ```yaml
   - cron: "*/30 * * * *"   # every 30 minutes
   ```

   Note: GitHub heavily throttles scheduled jobs on free-tier accounts — many ticks are delayed or dropped, so in practice this alone yields only a handful of runs per day (observed ~6–8/day), not every 30 minutes. This is kept as a free, zero-maintenance backup.

2. **An external trigger for reliable 30-minute cadence** (what actually drives the cadence). A scheduler outside GitHub calls the workflow's `workflow_dispatch` endpoint on a cron; API-triggered runs are *not* subject to the `schedule` throttling above.

### External trigger (Cloudflare Worker)

If you only want the built-in `schedule` cron, you can stop here — it works with zero extra setup, it's just unreliable (see above). For dependable 30-minute cadence, add a free external scheduler that calls the dispatch endpoint. Here's the full setup using a Cloudflare Worker (all on the free plan):

1. **Create a GitHub token.** In **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**, generate a token scoped to **only this repository**, with **Repository permissions → Actions: Read and write** (write is what allows dispatching a run; `Metadata: Read` is added automatically). Copy it — you'll paste it into Cloudflare, and it never goes in the repo.

2. **Create a Cloudflare account** (free, no card) and open **Compute (Workers) → Workers & Pages**.

3. **Create a Worker** via **Create → Workers → Start with Hello World!**, name it (e.g. `drive-time-trigger`), and **Deploy**.

4. **Replace the code** (Edit code) with the following, filling in your owner/repo:

   ```js
   const OWNER = "<your-github-username>";
   const REPO = "<your-repo-name>";
   const WORKFLOW = "fetch.yml";

   async function dispatch(env) {
     return fetch(
       `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
       {
         method: "POST",
         headers: {
           "Authorization": `Bearer ${env.GH_TOKEN}`,
           "Accept": "application/vnd.github+json",
           "X-GitHub-Api-Version": "2022-11-28",
           "User-Agent": "drive-time-trigger-worker", // GitHub rejects requests without one
         },
         body: JSON.stringify({ ref: "main" }),
       }
     );
   }

   export default {
     // Fired automatically by the cron trigger (step 7).
     async scheduled(event, env, ctx) {
       ctx.waitUntil(dispatch(env));
     },
     // Visit the Worker URL to test-fire manually. Always returns 200: a
     // successful dispatch is GitHub 204, and reusing a 204 status on the
     // Worker's own Response would trip the constructor (204 carries no body).
     async fetch(request, env, ctx) {
       // Browsers also request /favicon.ico — ignore anything but the root
       // path so a single visit doesn't fire two dispatches.
       if (new URL(request.url).pathname !== "/") {
         return new Response("Not found\n", { status: 404 });
       }
       const res = await dispatch(env);
       const ok = res.status === 204;
       const msg = ok
         ? `OK: dispatched (GitHub returned ${res.status})`
         : `Problem: GitHub returned ${res.status} ${res.statusText}`;
       return new Response(msg + "\n", {
         status: 200,
         headers: { "content-type": "text/plain; charset=utf-8" },
       });
     },
   };
   ```

   **Deploy.**

5. **Add the token as a secret.** In the Worker's **Settings → Variables and Secrets**, add one of **type Secret** (not Text) named `GH_TOKEN`, value = the token from step 1. Save.

6. **Test it** (optional): visit the Worker's `*.workers.dev` URL. You should see `OK: dispatched (GitHub returned 204)`, and a fresh run should appear under the repo's **Actions** tab. (A `Problem: …` message with `401`/`403` means the token or its permissions are off; `404` means the owner/repo/workflow name is wrong.)

7. **Add the cron trigger.** In the Worker's **Settings → Trigger Events → Cron Triggers**, add `*/30 * * * *` (Cloudflare also accepts plain-English intervals). Save.

That's it — Cloudflare now fires the dispatch every 30 minutes. Cloudflare cron goes down to 1-minute granularity on the free plan; the practical limit on polling faster is Google Maps API cost (see below), not the scheduler. And because this is a public repo, the GitHub Actions minutes are free and unlimited.

## Cost

The fetch uses the Routes API with `routingPreference: "TRAFFIC_AWARE"`, which bills at the **Compute Routes Pro** SKU: **$10 per 1,000 calls**, with the **first 10,000 calls per month free** (Google removed the old shared $200/month credit on 2025-03-01 in favor of per-SKU free allowances).

Each run makes one call per **polled** route in [`config.json`](config.json). A route with `"fetch": false` is kept in the config — so the app still charts its historical data — but is no longer polled, so it costs nothing going forward. Keep `polled routes × calls-per-month` under 10,000 to stay in the free tier:

- **4 routes every 30 min** = 4 × 48/day × ~30.4 = ~5,800 calls/month → **free**.
- **6 routes every 15 min** = ~17,500 calls/month → ~7,500 billable → **~$75/month**.

Levers if you approach the cap: poll less often (the cron above), stop polling a route with `"fetch": false` (keeps its history visible), restrict to certain hours (see the quiet window below), or — at the cost of accuracy — switch to `TRAFFIC_UNAWARE` (the cheaper $5 Essentials SKU).

**Overnight quiet window.** Regardless of which trigger fires it, `fetch.js` makes no API calls between **12:10am and 3:50am Pacific** (computed in `America/Los_Angeles`, so it's DST-correct year-round). The window is deliberately offset 10 minutes inside the hour so that the **12:00am and 4:00am ticks still fire** — holding the endpoints of the gap — while the interior half-hour ticks are skipped. During the window the run still completes successfully (it just logs `SKIP ALL` and exits). To change it, edit `QUIET_START` / `QUIET_END` in `fetch.js`.

## Running manually

You can trigger a one-off fetch from the **Actions** tab → **Fetch drive time** → **Run workflow**, or by visiting the Cloudflare Worker's URL.

## Data format

Each route's drive times are stored in its own file, `data/<id>.jsonl` (e.g. `data/home-to-work.jsonl`) — one JSON object per line:

```json
{"timestamp":"2026-06-24T18:00:00.000Z","minutes":12}
```

The files are committed back to the repo automatically after each fetch.
