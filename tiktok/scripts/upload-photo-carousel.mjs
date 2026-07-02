#!/usr/bin/env node
// Upload a rendered Remotion carousel to TikTok's photo draft inbox.
//
// TikTok's photo API only supports PULL_FROM_URL, so the slide PNGs must
// already be hosted on a public URL prefix/domain verified in the TikTok app.
//
// Usage:
//   node tiktok/scripts/upload-photo-carousel.mjs upload --deck spanish-cognates-01 --base-url https://example.com/carousels/spanish-cognates-01/
//   node tiktok/scripts/upload-photo-carousel.mjs upload --deck spanish-cognates-01 --base-url https://example.com/carousels/spanish-cognates-01/ --dry-run
//   node tiktok/scripts/upload-photo-carousel.mjs status

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(SCRIPT_DIR, ".tiktok-credentials.json");
const TOKENS_PATH = path.join(SCRIPT_DIR, ".tiktok-tokens.json");
const MANIFEST_PATH = path.join(SCRIPT_DIR, ".photo-upload-manifest.json");
const CAROUSEL_DIR = path.join(SCRIPT_DIR, "..", "remotion", "out", "carousels");
const API = "https://open.tiktokapis.com";

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    console.error(`Missing ${file}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function parseArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

function joinUrl(baseUrl, file) {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(file)}`;
}

function deckFromFlags(flags) {
  const deckId = flags.deck || "spanish-cognates-01";
  const deckDir = path.join(CAROUSEL_DIR, deckId);
  const manifest = readJson(path.join(deckDir, "manifest.json"));
  const images = manifest.images || [];
  if (images.length === 0) {
    throw new Error(`No images listed in ${path.join(deckDir, "manifest.json")}`);
  }
  if (images.length > 35) {
    throw new Error(`TikTok photo posts allow up to 35 images; ${deckId} has ${images.length}`);
  }

  for (const image of images) {
    const imagePath = path.join(deckDir, image);
    if (!fs.existsSync(imagePath)) throw new Error(`Missing slide image: ${imagePath}`);
  }

  const explicitUrls = flags.urls
    ? readJson(path.resolve(flags.urls)).map((url) => String(url))
    : null;
  if (explicitUrls && explicitUrls.length !== images.length) {
    throw new Error(`--urls contains ${explicitUrls.length} URLs, but ${deckId} has ${images.length} slides`);
  }
  if (!explicitUrls && !flags["base-url"]) {
    throw new Error("Provide --base-url for the hosted slide directory, or --urls with a JSON array of image URLs");
  }

  const photoImages = explicitUrls || images.map((image) => joinUrl(flags["base-url"], image));
  const hashtags = (manifest.hashtags || []).map((tag) => `#${String(tag).replace(/^#/, "")}`);
  const defaultDescription = [manifest.caption, hashtags.join(" ")].filter(Boolean).join("\n\n");

  return {
    id: deckId,
    title: flags.title || "Speak Spanish: -al words",
    description: flags.description || defaultDescription,
    photoImages,
    localImages: images.map((image) => path.join(deckDir, image)),
  };
}

const creds = readJson(CREDENTIALS_PATH);

async function tokenRequest(params) {
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: creds.client_key,
      client_secret: creds.client_secret,
      ...params,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Token request failed: ${JSON.stringify(data)}`);
  }
  return data;
}

function saveTokens(data) {
  writeJson(TOKENS_PATH, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    open_id: data.open_id,
    expires_at: Date.now() + (data.expires_in - 300) * 1000,
  });
}

async function getAccessToken() {
  const tokens = readJson(TOKENS_PATH, null);
  if (!tokens) {
    console.error("No tokens found. Run the existing OAuth flow first:");
    console.error("  node tiktok/scripts/upload-drafts.mjs auth");
    process.exit(1);
  }
  if (Date.now() < tokens.expires_at) return tokens.access_token;
  const data = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });
  saveTokens(data);
  return data.access_token;
}

async function apiPost(token, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error && data.error.code !== "ok") {
    throw new Error(`${endpoint} failed: ${JSON.stringify(data.error)}`);
  }
  return data.data;
}

async function waitForProcessing(token, publishId) {
  for (let i = 0; i < 30; i++) {
    const data = await apiPost(token, "/v2/post/publish/status/fetch/", {
      publish_id: publishId,
    });
    if (data.status === "SEND_TO_USER_INBOX" || data.status === "PUBLISH_COMPLETE") {
      return data.status;
    }
    if (data.status === "FAILED") {
      throw new Error(`Processing failed: ${data.fail_reason || "unknown"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return "PROCESSING_TIMEOUT";
}

function buildPayload(deck) {
  return {
    post_info: {
      title: deck.title,
      description: deck.description,
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: 0,
      photo_images: deck.photoImages,
    },
    post_mode: "MEDIA_UPLOAD",
    media_type: "PHOTO",
  };
}

async function upload(args) {
  const flags = parseArgs(args);
  const dryRun = Boolean(flags["dry-run"]);
  const force = Boolean(flags.force);
  const deck = deckFromFlags(flags);
  const manifest = readJson(MANIFEST_PATH, {});
  const payload = buildPayload(deck);

  if (!force && manifest[deck.id]) {
    console.log(`${deck.id} already uploaded at ${manifest[deck.id].uploaded_at}. Use --force to upload again.`);
    return;
  }

  console.log(`${deck.id}: ${deck.photoImages.length} photo(s)`);
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const token = await getAccessToken();
  const init = await apiPost(token, "/v2/post/publish/content/init/", payload);
  const status = await waitForProcessing(token, init.publish_id);
  manifest[deck.id] = {
    publish_id: init.publish_id,
    status,
    uploaded_at: new Date().toISOString(),
    title: deck.title,
    image_count: deck.photoImages.length,
  };
  writeJson(MANIFEST_PATH, manifest);

  console.log(status === "SEND_TO_USER_INBOX" ? "Sent to your TikTok inbox." : status);
  console.log("Open the TikTok app, tap the inbox notification, review, and post.");
}

function status() {
  const manifest = readJson(MANIFEST_PATH, {});
  const entries = Object.entries(manifest);
  if (entries.length === 0) {
    console.log("Photo upload manifest is empty.");
    return;
  }
  for (const [deck, info] of entries) {
    console.log(`${deck}  ${info.status}  ${info.uploaded_at}`);
  }
}

const [command, ...args] = process.argv.slice(2);
try {
  switch (command) {
    case "upload":
    case undefined:
      await upload(args);
      break;
    case "status":
      status();
      break;
    default:
      console.error(`Unknown command: ${command} (expected upload | status)`);
      process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
