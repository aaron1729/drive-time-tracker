# Drive Time Tracker

Polls Google Maps driving time between two points every 15 minutes and plots the history as a line chart on a GitHub Pages site.

## Setup

### 1. Add your API key

In your GitHub repo settings, go to **Settings → Secrets and variables → Actions** and add a secret named:

```
GOOGLE_MAPS_API_KEY
```

The key needs the **Routes API** enabled. No other APIs required.

### 2. Set your addresses

Edit [`config.json`](config.json):

```json
{
  "origin": "Your starting address",
  "destination": "Your ending address",
  "label": "Display name for the chart"
}
```

Any geocodable address string works (street address, landmark name, etc.).

### 3. Enable GitHub Pages

In repo settings, go to **Pages** and set the source to **Deploy from a branch → main → / (root)**.

The chart will be available at `https://<your-username>.github.io/<repo-name>/`.

## Changing the schedule

Edit the cron expression in [`.github/workflows/fetch.yml`](.github/workflows/fetch.yml):

```yaml
- cron: "*/15 * * * *"   # every 15 minutes
```

Note: GitHub Actions scheduled jobs can run with a few minutes of delay under load — that's normal.

## Running manually

You can trigger a one-off fetch from the **Actions** tab → **Fetch drive time** → **Run workflow**.

## Data format

Drive times are stored in [`data/history.jsonl`](data/history.jsonl) — one JSON object per line:

```json
{"timestamp":"2026-06-24T18:00:00.000Z","minutes":12}
```

The file is committed back to the repo automatically after each fetch.
