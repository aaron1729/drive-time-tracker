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

## Changing the schedule

Edit the cron expression in [`.github/workflows/fetch.yml`](.github/workflows/fetch.yml):

```yaml
- cron: "*/15 * * * *"   # every 15 minutes
```

Note: GitHub throttles scheduled jobs on busy/free-tier accounts — runs are often delayed and some scheduled ticks are dropped entirely, so the real cadence is usually coarser than the cron implies (expect roughly hourly rather than every 15 minutes). Occasionally a run may be cancelled before it starts if no runner is available; the next run recovers on its own.

## Running manually

You can trigger a one-off fetch from the **Actions** tab → **Fetch drive time** → **Run workflow**.

## Data format

Each route's drive times are stored in its own file, `data/<id>.jsonl` (e.g. `data/home-to-work.jsonl`) — one JSON object per line:

```json
{"timestamp":"2026-06-24T18:00:00.000Z","minutes":12}
```

The files are committed back to the repo automatically after each fetch.
