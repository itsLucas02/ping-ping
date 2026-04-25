#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const APP_VERSION = "1.1.0";
const ROOT_DIR = __dirname;
const PORT = 19999;
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;
const PING_URL = `http://127.0.0.1:${PORT}/ping`;
const VALID_STATUSES = new Set(["success", "error", "warning", "info", "busy"]);

function printHelp() {
  console.log("");
  console.log("============================================================");
  console.log(` ping-ping helper (v${APP_VERSION}) - AI Workspace integration`);
  console.log("============================================================");
  console.log("");
  console.log(" DESCRIPTION:");
  console.log("   Sends a local ping-ping notification.");
  console.log("   If the ping-ping server is offline, this helper can start it.");
  console.log("");
  console.log(" USAGE:");
  console.log("   node ping.js --title <string> --message <string> [--status <string>]");
  console.log("   ./ping.sh --title <string> --message <string> [--status <string>]");
  console.log("   ./ping.sh -Title <string> -Message <string> [-Status <string>]");
  console.log("");
  console.log(" PARAMETERS:");
  console.log("   --title, -Title     Notification title (required)");
  console.log("   --message, -Message Notification body (required)");
  console.log("   --status, -Status   success | error | warning | info | busy");
  console.log("   --token, -Token     Optional auth token; defaults to PING_TOKEN env");
  console.log("   --no-start          Do not auto-start ping-ping if it is offline");
  console.log("   --help, -h          Show this help");
  console.log("");
  console.log(" EXAMPLES:");
  console.log('   ./ping.sh --title "Codex" --message "Task completed" --status success');
  console.log('   node ping.js -Title "Codex" -Message "Need review" -Status warning');
  console.log("============================================================");
}

function parseArgs(argv) {
  const args = {
    status: "info",
    token: process.env.PING_TOKEN || "",
    noStart: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw) continue;

    const normalized = raw.startsWith("-") ? raw.replace(/^-+/, "").toLowerCase() : raw;
    const next = argv[index + 1];
    const takeValue = () => {
      index += 1;
      return next;
    };

    if (normalized === "help" || normalized === "h") {
      args.help = true;
      continue;
    }
    if (normalized === "no-start" || normalized === "nostart") {
      args.noStart = true;
      continue;
    }
    if (normalized === "title") {
      args.title = takeValue();
      continue;
    }
    if (normalized === "message") {
      args.message = takeValue();
      continue;
    }
    if (normalized === "status") {
      args.status = takeValue();
      continue;
    }
    if (normalized === "token") {
      args.token = takeValue();
      continue;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function checkHealth() {
  try {
    const response = await fetch(HEALTH_URL);
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

function ensureLogDir() {
  const baseDir =
    process.platform === "win32"
      ? path.join(process.env.APPDATA || ROOT_DIR, "ping-ping")
      : path.join(process.env.HOME || ROOT_DIR, ".ping-ping");
  fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

function startServerInBackground() {
  const electronCli = path.join(ROOT_DIR, "node_modules", "electron", "cli.js");
  if (!fs.existsSync(electronCli)) {
    throw new Error(
      "Electron is not installed yet. Run `npm install` inside the ping-ping repo first.",
    );
  }

  const logFile = path.join(ensureLogDir(), "startup.log");
  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");
  const args = [electronCli, "."];

  if (process.platform === "linux") {
    args.push("--no-sandbox");
  }

  const child = spawn(process.execPath, args, {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ["ignore", out, err],
  });
  child.unref();

  return logFile;
}

async function ensureServerRunning({ noStart }) {
  if (await checkHealth()) return;
  if (noStart) {
    throw new Error("ping-ping server is offline and auto-start is disabled.");
  }

  const logFile = startServerInBackground();
  const maxStartupRetries = 12;
  const retryIntervalMs = 2000;

  for (let attempt = 1; attempt <= maxStartupRetries; attempt += 1) {
    await sleep(retryIntervalMs);
    if (await checkHealth()) return;
  }

  throw new Error(
    `ping-ping server failed to start after ${Math.round(
      (maxStartupRetries * retryIntervalMs) / 1000,
    )} seconds. Check ${logFile}`,
  );
}

async function sendPing({ title, message, status, token }) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["X-PING-TOKEN"] = token;
  }

  const response = await fetch(PING_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      message,
      status,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const hint = data?.error?.hint || response.statusText || "Unknown error";
    throw new Error(`Ping failed: ${hint}`);
  }

  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.title && !args.message)) {
    printHelp();
    process.exit(0);
  }

  const title = String(args.title || "").trim();
  const message = String(args.message || "").trim();
  const status = String(args.status || "info")
    .trim()
    .toLowerCase();

  if (!title || !message) {
    throw new Error("Both --title and --message are required. Run `node ping.js --help`.");
  }
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid status '${args.status}'. Use: success, error, warning, info, busy.`);
  }

  await ensureServerRunning({ noStart: args.noStart });
  const response = await sendPing({ title, message, status, token: args.token });
  console.log(`Ping sent successfully (ID: ${response.id})`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
