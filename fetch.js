#!/usr/bin/env node
// Fetches drive time via Google Routes API and appends to data/history.jsonl

const https = require("https");
const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.error("ERROR: GOOGLE_MAPS_API_KEY environment variable not set");
  process.exit(1);
}

const body = JSON.stringify({
  origin: { address: config.origin },
  destination: { address: config.destination },
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
      console.error(`ERROR: API returned ${res.statusCode}: ${data}`);
      process.exit(1);
    }

    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      console.error(`ERROR: Failed to parse API response: ${data}`);
      process.exit(1);
    }

    const routes = parsed.routes;
    if (!routes || routes.length === 0) {
      console.error(`ERROR: No routes returned. Response: ${data}`);
      process.exit(1);
    }

    const durationStr = routes[0].duration; // e.g. "754s"
    const seconds = parseInt(durationStr.replace("s", ""), 10);
    if (isNaN(seconds)) {
      console.error(`ERROR: Unexpected duration format: ${durationStr}`);
      process.exit(1);
    }

    const minutes = Math.round(seconds / 60);
    const timestamp = new Date().toISOString();

    const row = JSON.stringify({ timestamp, minutes }) + "\n";

    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

    fs.appendFileSync(path.join(dataDir, "history.jsonl"), row, "utf8");
    console.log(`OK: ${timestamp} → ${minutes} min`);
  });
});

req.on("error", (e) => {
  console.error(`ERROR: Request failed: ${e.message}`);
  process.exit(1);
});

req.write(body);
req.end();
