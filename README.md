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
   - cron: "*/15 * * * *"   # every 15 minutes
   ```

   Note: GitHub heavily throttles scheduled jobs on free-tier accounts — many ticks are delayed or dropped, so in practice this alone yields only a handful of runs per day (observed ~6–8/day), not every 15 minutes. This is kept as a free, zero-maintenance backup.

2. **An external trigger for reliable 15-minute cadence** (what actually drives the cadence). A scheduler outside GitHub calls the workflow's `workflow_dispatch` endpoint on a cron; API-triggered runs are *not* subject to the `schedule` throttling above.

### External trigger (Cloudflare Worker)

If you only want the built-in `schedule` cron, you can stop here — it works with zero extra setup, it's just unreliable (see above). For dependable 15-minute cadence, add a free external scheduler that calls the dispatch endpoint. Here's the full setup using a Cloudflare Worker (all on the free plan):

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

7. **Add the cron trigger.** In the Worker's **Settings → Trigger Events → Cron Triggers**, add `*/15 * * * *` (Cloudflare also accepts plain-English intervals). Save.

That's it — Cloudflare now fires the dispatch every 15 minutes. Cloudflare cron goes down to 1-minute granularity on the free plan; the practical limit on polling faster is Google Maps API cost, not the scheduler. And because this is a public repo, the GitHub Actions minutes are free and unlimited.

## Running manually

You can trigger a one-off fetch from the **Actions** tab → **Fetch drive time** → **Run workflow**, or by visiting the Cloudflare Worker's URL.

## Data format

Each route's drive times are stored in its own file, `data/<id>.jsonl` (e.g. `data/home-to-work.jsonl`) — one JSON object per line:

```json
{"timestamp":"2026-06-24T18:00:00.000Z","minutes":12}
```

The files are committed back to the repo automatically after each fetch.
