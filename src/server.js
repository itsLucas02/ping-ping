const express = require("express");
const { PORT } = require("./config");
const {
  getNotifications,
  addNotification,
  clearNotifications,
} = require("./store");

const VALID_STATUSES = ["success", "error", "warning", "info"];

function createServer(onPing) {
  const app = express();
  app.use(express.json());

  // Allow CORS for local dashboard
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // POST /ping — receive a notification from an agent
  app.post("/ping", (req, res) => {
    const { title, message, status } = req.body || {};

    if (!title || typeof title !== "string" || title.trim() === "") {
      return res.status(400).json({
        ok: false,
        error: "`title` is required and must be a non-empty string.",
      });
    }
    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({
        ok: false,
        error: "`message` is required and must be a non-empty string.",
      });
    }

    const resolvedStatus = status || "info";
    if (!VALID_STATUSES.includes(resolvedStatus)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid \`status\`. Must be one of: ${VALID_STATUSES.join(", ")}.`,
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

    return res.status(200).json({ ok: true, id: entry.id });
  });

  // GET /health — uptime check
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      port: PORT,
      uptime: Math.floor(process.uptime()),
    });
  });

  // GET /api/notifications — return history
  app.get("/api/notifications", (req, res) => {
    res.json(getNotifications());
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
      return res
        .status(400)
        .json({ ok: false, error: "Invalid JSON in request body." });
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
