const express = require("express");
const { PORT, APP_VERSION } = require("./config");
const {
  getNotifications,
  addNotification,
  deleteNotification,
  markNotificationsRead,
  clearNotifications,
} = require("./store");

const VALID_STATUSES = ["success", "error", "warning", "info", "busy"];

// Browser origins allowed to talk to the API. The dashboard runs from
// file:// (sends Origin: null); local tooling sends no Origin at all.
// Everything else (i.e. random websites) is refused.
function originIsAllowed(origin) {
  if (origin === undefined || origin === "null") return true;
  return (
    origin === `http://localhost:${PORT}` ||
    origin === `http://127.0.0.1:${PORT}`
  );
}

function createServer(onPing) {
  const app = express();

  // High-priority: Tolerant input modes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true })); // fallback for x-www-form-urlencoded

  // Very simple rate limit (approx 100 max per minute)
  const rateLimitMap = new Map();
  app.use((req, res, next) => {
    const ip = req.ip || "127.0.0.1";
    const now = Date.now();
    const records = rateLimitMap.get(ip) || [];
    const validRecords = records.filter(t => now - t < 60_000);

    if (validRecords.length >= 100) {
      return res.status(429).json({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          hint: "Too many requests. Please wait before sending more pings."
        }
      });
    }

    validRecords.push(now);
    rateLimitMap.set(ip, validRecords);
    next();
  });

  // CORS: only the local dashboard and native/no-origin clients are allowed.
  // Requests that carry a foreign Origin header (browser tabs on other sites)
  // are rejected outright so web pages can neither read history nor spam pings.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!originIsAllowed(origin)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "FORBIDDEN_ORIGIN",
          hint: "This API only accepts local clients and the ping-ping dashboard."
        }
      });
    }
    res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "null" : "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PING-TOKEN");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // POST /ping — receive a notification from an agent
  app.post("/ping", (req, res) => {
    // Check for optional X-PING-TOKEN if PING_TOKEN env is set
    const expectedToken = process.env.PING_TOKEN;
    if (expectedToken) {
      const providedToken = req.headers["x-ping-token"];
      if (providedToken !== expectedToken) {
        return res.status(401).json({
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            hint: "Invalid or missing X-PING-TOKEN header. Check your PING_TOKEN environment variable."
          }
        });
      }
    }

    // Merge query into body to allow local automation fallback passing params via URL
    const payload = { ...req.query, ...req.body } || {};
    const { title, message, status } = payload;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return res.status(400).json({
        ok: false,
        error: {
          code: "MISSING_TITLE",
          hint: "The `title` field is required and must be a non-empty string."
        }
      });
    }
    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({
        ok: false,
        error: {
          code: "MISSING_MESSAGE",
          hint: "The `message` field is required and must be a non-empty string."
        }
      });
    }

    const resolvedStatus = (typeof status === "string" ? status.toLowerCase() : "info") || "info";
    
    if (!VALID_STATUSES.includes(resolvedStatus)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_STATUS",
          hint: `Status '${status}' is invalid. Must be one of: ${VALID_STATUSES.join(", ")}.`
        }
      });
    }

    const entry = addNotification({
      title: title.trim(),
      message: message.trim(),
      status: resolvedStatus,
    });

    // Trigger Electron toast notification via callback
    if (typeof onPing === "function") {
      onPing(entry);
    }

    // Return quickly with 202 to indicate async processing success, including timestamp payload
    return res.status(202).json({ 
      ok: true, 
      id: entry.id,
      ts: entry.timestamp
    });
  });

  // GET /health — uptime check
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: "ping-ping",
      version: APP_VERSION,
      port: PORT,
      uptime: Math.floor(process.uptime()),
    });
  });

  // GET /api/notifications — return history
  app.get("/api/notifications", (req, res) => {
    res.json(getNotifications());
  });

  // POST /api/notifications/mark-read — mark some or all as read
  app.post("/api/notifications/mark-read", (req, res) => {
    const { ids, all } = req.body || {};
    if (!all && !Array.isArray(ids)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_MARK_READ",
          hint: 'Provide either { "all": true } or { "ids": ["..."] }.'
        }
      });
    }
    if (ids && ids.some((id) => typeof id !== "string")) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_MARK_READ",
          hint: "`ids` must be an array of notification id strings."
        }
      });
    }
    const updated = markNotificationsRead({ ids, all });
    res.json({ ok: true, updated });
  });

  // DELETE /api/notifications/:id — remove a single notification
  app.delete("/api/notifications/:id", (req, res) => {
    const removed = deleteNotification(req.params.id);
    if (!removed) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          hint: `No notification with id '${req.params.id}'.`
        }
      });
    }
    res.json({ ok: true });
  });

  // DELETE /api/notifications — clear history
  app.delete("/api/notifications", (req, res) => {
    clearNotifications();
    res.json({ ok: true });
  });

  // Catch malformed JSON bodies (e.g. empty or invalid payloads sent by agents)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      return res.status(400).json({ 
        ok: false, 
        error: {
          code: "INVALID_JSON",
          hint: "The request body contains malformed JSON."
        }
      });
    }
    next(err);
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, "127.0.0.1", () => {
      console.log(`ping-ping server listening on http://localhost:${PORT}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}

module.exports = { createServer };
