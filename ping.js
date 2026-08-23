#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const APP_VERSION = "1.2.0";
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
  console.log('   ping-ping --title "Codex 5.5 High" --message "Task complete" --status success');
  console.log('   ping-ping -t "Kimi K2" -m "Need your review" -s warning');
  console.log('   ping-ping -t "Qwen Coder" -m "Starting a long task" -s busy');
  console.log("");
  console.log(" PARAMETERS:");
  console.log("   --title, -t, -Title     Required. Self-identify with your agent/model name.");
  console.log("   --message, -m, -Message Notification body.");
  console.log("   --status, -s, -Status   success | error | warning | info | busy. Default: success");
  console.log("   --token, -Token     Optional auth token; defaults to PING_TOKEN env");
  console.log("   --start-only        Start ping-ping if offline, then exit without sending a notification");
  console.log("   --no-start          Do not auto-start ping-ping if it is offline");
  console.log("   --version, -v       Print the ping-ping version");
  console.log("   --help, -h          Show this help");
  console.log("");
  console.log(" TITLE EXAMPLES:");
  console.log("   Codex 5.5 High, Gemini Pro, Claude Opus, Kimi K2, Qwen Coder,");
  console.log("   DeepSeek, Z AI, OpenCode, Cursor Agent, Goose, Aider.");
  console.log("");
  console.log(" STATUS GUIDE:");
  console.log("   success  Completion or successful result.");
  console.log("   warning  Question, approval, or owner review needed.");
  console.log("   error    Blocked, failed, or urgent attention needed.");
  console.log("   info     General progress update.");
  console.log("   busy     Long task started or still running.");
  console.log("");
  console.log(" AGENT NOTIFICATION PROTOCOL:");
  console.log("   Use ping-ping for status updates.");
  console.log("   Ping the owner when:");
  console.log("   - You start a long task: --status busy");
  console.log("   - You make progress: --status info");
  console.log("   - You need owner input, approval, or review: --status warning");
  console.log("   - You are blocked or something failed: --status error");
  console.log("   - You finish successfully: --status success");
  console.log("   Always use your own agent/model name as --title.");
  console.log("============================================================");
}

function parseArgs(argv) {
  const args = {
    status: "success",
    token: process.env.PING_TOKEN || "",
    startOnly: false,
    noStart: false,
    version: false,
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
    if (normalized === "version" || normalized === "v") {
      args.version = true;
      continue;
    }
    if (normalized === "start-only" || normalized === "startonly") {
      args.startOnly = true;
      continue;
    }
    if (normalized === "no-start" || normalized === "nostart") {
      args.noStart = true;
      continue;
    }
    if (normalized === "title" || normalized === "t") {
      args.title = takeValue();
      continue;
    }
    if (normalized === "message" || normalized === "m") {
      args.message = takeValue();
      continue;
    }
    if (normalized === "status" || normalized === "s") {
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

  if (process.platform === "linux" || process.platform === "win32") {
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
  if (args.version) {
    console.log(`ping-ping v${APP_VERSION}`);
    process.exit(0);
  }
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.startOnly) {
    await ensureServerRunning({ noStart: args.noStart });
    console.log("ping-ping is running.");
    process.exit(0);
  }

  const title = String(args.title || "").trim();
  const message = String(args.message || "").trim();
  const status = String(args.status || "success")
    .trim()
    .toLowerCase();

  if (!title) {
    throw new Error(
      'Missing title. Self-identify with --title "Your Agent/Model Name". Example: ping-ping --title "Kimi K2" --message "Task complete" --status success',
    );
  }
  if (!message) {
    throw new Error('Missing message. Use --message "Message text". Run `ping-ping --help`.');
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
