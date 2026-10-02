#!/usr/bin/env node
// Fetches drive time for all routes via Google Routes API and appends to data/<id>.jsonl

const https = require("https");
const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.error("ERROR: GOOGLE_MAPS_API_KEY environment variable not set");
  process.exit(1);
}

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

function fetchRoute(route) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      origin: { address: route.origin },
      destination: { address: route.destination },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    });

    const options = {
      hostname: "routes.googleapis.com",
      path: "/directions/v2:computeRoutes",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "routes.duration",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`API returned ${res.statusCode}: ${data}`));
        }

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          return reject(new Error(`Failed to parse API response: ${data}`));
        }

        const routes = parsed.routes;
        if (!routes || routes.length === 0) {
          return reject(new Error(`No routes returned. Response: ${data}`));
        }

        const durationStr = routes[0].duration; // e.g. "754s"
        const seconds = parseInt(durationStr.replace("s", ""), 10);
        if (isNaN(seconds)) {
          return reject(new Error(`Unexpected duration format: ${durationStr}`));
        }

        const minutes = Math.round(seconds / 60);
        const timestamp = new Date().toISOString();
        const row = JSON.stringify({ timestamp, minutes }) + "\n";

        fs.appendFileSync(path.join(dataDir, `${route.id}.jsonl`), row, "utf8");
        console.log(`OK [${route.id}]: ${timestamp} → ${minutes} min`);
        resolve();
      });
    });

    req.on("error", (e) => reject(new Error(`Request failed: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

// Pacific-time quiet window: skip fetching 12am–4am PT. The charts don't need
// overnight resolution, and this trims API calls. Computed in America/Los_Angeles
// so it's correct year-round across DST. Gates every trigger path (Cloudflare
// cron and the GitHub backup schedule alike).
function pacificHour() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return parseInt(parts.find((p) => p.type === "hour").value, 10) % 24;
}

(async () => {
  const ph = pacificHour();
  if (ph >= 0 && ph < 4) {
    console.log(`SKIP ALL: ${ph}:xx Pacific is within the 12am-4am quiet window`);
    return;
  }

  let anyError = false;
  for (const route of config.routes) {
    // Routes with "fetch": false are kept in config (so the app still shows
    // their historical data) but no longer polled — see README "Cost".
    if (route.fetch === false) {
      console.log(`SKIP [${route.id}]: fetch disabled in config`);
      continue;
    }
    try {
      await fetchRoute(route);
    } catch (e) {
      console.error(`ERROR [${route.id}]: ${e.message}`);
      anyError = true;
    }
  }
  if (anyError) process.exit(1);
})();
