#!/usr/bin/env node
// Upload rendered variant videos to the owner's TikTok draft inbox via the
// Content Posting API (inbox/upload mode — user finishes posting in the app).
//
// Usage:
//   node tiktok/scripts/upload-drafts.mjs auth            # one-time OAuth
//   node tiktok/scripts/upload-drafts.mjs upload          # upload new videos
//   node tiktok/scripts/upload-drafts.mjs upload --dry-run
//   node tiktok/scripts/upload-drafts.mjs upload --limit 3
//   node tiktok/scripts/upload-drafts.mjs upload --file lesson-04-no-es-15s.mp4
//   node tiktok/scripts/upload-drafts.mjs upload --file ../remotion/out/finalized/lesson-05-ant-ent.mp4 --force
//   node tiktok/scripts/upload-drafts.mjs status          # show manifest

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(SCRIPT_DIR, ".tiktok-credentials.json");
const TOKENS_PATH = path.join(SCRIPT_DIR, ".tiktok-tokens.json");
const MANIFEST_PATH = path.join(SCRIPT_DIR, ".upload-manifest.json");
const VIDEO_DIR = path.join(SCRIPT_DIR, "..", "remotion", "out", "variants");

const API = "https://open.tiktokapis.com";
const SCOPES = "user.info.basic,video.upload";
// TikTok requires chunks of 5–64 MB; files at or under 64 MB go as one chunk.
const MAX_SINGLE_CHUNK = 64 * 1024 * 1024;
const CHUNK_SIZE = 10 * 1024 * 1024;

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

async function auth() {
  const authUrl =
    "https://www.tiktok.com/v2/auth/authorize/?" +
    new URLSearchParams({
      client_key: creds.client_key,
      scope: SCOPES,
      response_type: "code",
      redirect_uri: creds.redirect_uri,
      state: Math.random().toString(36).slice(2),
    });
  console.log("\nOpen this URL in your browser and approve access:\n");
  console.log(`  ${authUrl}\n`);
  console.log("After approving, the callback page shows a code. Paste it here.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question("Authorization code: ")).trim();
  rl.close();

  const data = await tokenRequest({
    grant_type: "authorization_code",
    code: decodeURIComponent(code),
    redirect_uri: creds.redirect_uri,
  });
  saveTokens(data);
  console.log(`\nAuthorized. Tokens saved to ${TOKENS_PATH}`);
}

async function getAccessToken() {
  const tokens = readJson(TOKENS_PATH, null);
  if (!tokens) {
    console.error("No tokens found. Run the auth command first:");
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

async function uploadFile(token, filePath) {
  const size = fs.statSync(filePath).size;
  const singleChunk = size <= MAX_SINGLE_CHUNK;
  const chunkSize = singleChunk ? size : CHUNK_SIZE;
  const chunkCount = singleChunk ? 1 : Math.floor(size / chunkSize);

  const init = await apiPost(token, "/v2/post/publish/inbox/video/init/", {
    source_info: {
      source: "FILE_UPLOAD",
      video_size: size,
      chunk_size: chunkSize,
      total_chunk_count: chunkCount,
    },
  });

  const buffer = fs.readFileSync(filePath);
  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    // The final chunk absorbs the remainder.
    const end = i === chunkCount - 1 ? size - 1 : start + chunkSize - 1;
    const res = await fetch(init.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
      body: buffer.subarray(start, end + 1),
    });
    if (!res.ok && res.status !== 201) {
      throw new Error(`Chunk upload failed (${res.status}): ${await res.text()}`);
    }
  }
  return init.publish_id;
}

async function waitForProcessing(token, publishId) {
  for (let i = 0; i < 30; i++) {
    const data = await apiPost(token, "/v2/post/publish/status/fetch/", {
      publish_id: publishId,
    });
    if (data.status === "SEND_TO_USER_INBOX") return data.status;
    if (data.status === "FAILED") {
      throw new Error(`Processing failed: ${data.fail_reason || "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return "PROCESSING_TIMEOUT";
}

async function upload(args) {
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;

  const manifest = readJson(MANIFEST_PATH, {});
  const requestedFiles = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file") {
      const fileArg = args[i + 1];
      if (!fileArg) {
        console.error("--file requires a filename or path");
        process.exit(1);
      }
      requestedFiles.push(fileArg);
      i++;
    }
  }

  const files =
    requestedFiles.length > 0
      ? requestedFiles.map((fileArg) => {
          const filePath = path.isAbsolute(fileArg)
            ? fileArg
            : fs.existsSync(path.join(VIDEO_DIR, fileArg))
              ? path.join(VIDEO_DIR, fileArg)
              : path.resolve(SCRIPT_DIR, fileArg);
          const file = path.basename(filePath);
          return { file, filePath };
        })
      : fs
          .readdirSync(VIDEO_DIR)
          .filter((f) => f.endsWith(".mp4"))
          .sort()
          .filter((f) => force || !manifest[f])
          .map((file) => ({ file, filePath: path.join(VIDEO_DIR, file) }));

  const uploadable = files.filter(({ file, filePath }) => {
    if (!fs.existsSync(filePath)) {
      console.error(`Missing video file: ${filePath}`);
      process.exitCode = 1;
      return false;
    }
    if (!file.endsWith(".mp4")) {
      console.error(`Not an mp4 file: ${filePath}`);
      process.exitCode = 1;
      return false;
    }
    if (!force && manifest[file]) {
      console.log(`Skipping ${file} — already in manifest. Use --force to upload again.`);
      return false;
    }
    return true;
  });

  if (uploadable.length === 0) {
    console.log("Nothing new to upload — all videos are in the manifest.");
    return;
  }
  const batch = uploadable.slice(0, limit);
  console.log(`${uploadable.length} video(s); uploading ${batch.length}${dryRun ? " (dry run)" : ""}:`);

  const token = dryRun ? null : await getAccessToken();
  for (const { file, filePath } of batch) {
    const mb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
    if (dryRun) {
      console.log(`  would upload ${file} (${mb} MB)`);
      continue;
    }
    process.stdout.write(`  ${file} (${mb} MB) ... `);
    try {
      const publishId = await uploadFile(token, filePath);
      const status = await waitForProcessing(token, publishId);
      manifest[file] = { publish_id: publishId, status, uploaded_at: new Date().toISOString() };
      writeJson(MANIFEST_PATH, manifest);
      console.log(status === "SEND_TO_USER_INBOX" ? "in your inbox ✓" : status);
    } catch (err) {
      console.log("FAILED");
      console.error(`    ${err.message}`);
    }
  }
  console.log("\nDone. Open the TikTok app — each video is an inbox notification;");
  console.log("tap it to caption and post. Note: inbox uploads expire if left unposted.");
}

function status() {
  const manifest = readJson(MANIFEST_PATH, {});
  const entries = Object.entries(manifest);
  if (entries.length === 0) {
    console.log("Manifest is empty — nothing uploaded yet.");
    return;
  }
  for (const [file, info] of entries) {
    console.log(`${file}  ${info.status}  ${info.uploaded_at}`);
  }
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "auth":
    await auth();
    break;
  case "upload":
  case undefined:
    await upload(args);
    break;
  case "status":
    status();
    break;
  default:
    console.error(`Unknown command: ${command} (expected auth | upload | status)`);
    process.exit(1);
}
