<div align="center">

# 🔔 ping-ping

**A local-first notification relay for AI agents.**

Turn `curl`-sized pings from your CLI agents into native desktop notifications —
so Codex, Claude Code, and friends can tell you when they're done, stuck, or need a decision.

[![Release](https://img.shields.io/github/v/release/itsLucas02/ping-ping?style=flat-square)](https://github.com/itsLucas02/ping-ping/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue?style=flat-square)](#getting-started)
[![Node](https://img.shields.io/badge/node-16%2B-brightgreen?style=flat-square)](https://nodejs.org/)

</div>

---

AI coding agents run for minutes at a time with no idea when they'll finish. ping-ping gives
them a one-liner to tap you on the shoulder: a native toast, a searchable history in a
dashboard, and an unread count in your tray — all on `127.0.0.1`, nothing leaves your machine.

```
Agent finishes ──▶ POST /ping ──▶ 🔔 toast + tray flash + dashboard entry
```

## ✨ Features

- 🍞 **Native desktop notifications** — instant visual feedback with sound (toggleable)
- 📥 **One-line HTTP API** — JSON, form-encoded, or plain query params; tolerant by design
- 🎨 **Five status levels** — `success` · `error` · `warning` · `info` · `busy`
- 📊 **Dashboard** — status filters, search, unread tracking, day grouping, copy & delete, keyboard shortcuts
- 🌙 **Pause mode** — silence toasts from the tray while agents keep recording history
- 🖥️ **Quiet tray citizen** — no taskbar clutter; window position, sound, and launch-at-login remembered
- 🔒 **Local-only by default** — websites you visit cannot read your history or spam pings; optional token auth for the API

## 🚀 Getting Started

### Prerequisites

- Windows 10/11 or macOS
- [Node.js](https://nodejs.org/) 16+

### Install & run

```bash
git clone https://github.com/itsLucas02/ping-ping.git
cd ping-ping
npm install
npm start
```

ping-ping starts silently in your tray (Windows notification area / macOS menu bar).
`npm start` is idempotent — if it's already running on port `19999`, it exits cleanly.

### Send your first ping

```bash
ping-ping --title "My Agent" --message "Task complete!" --status success
```

…or from any machine language:

```bash
curl -X POST http://127.0.0.1:19999/ping \
  -H "Content-Type: application/json" \
  -d '{"title":"My Agent","message":"Task complete!","status":"success"}'
```

A toast appears and the ping lands in the dashboard. That's the whole loop.

## 🤖 Connecting Your AI Agents

Add this to your agent's instruction file (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, …):

```text
Use ping-ping for status updates. Run `ping-ping --help` if needed.

Ping me when:
- you start a long task: --status busy
- you make progress: --status info
- you need my input, approval, or review: --status warning
- you are blocked or something failed: --status error
- you finish successfully: --status success

Use your own agent/model name as the title.
```

### Status guide

| Status | Color | Use when |
|---|---|---|
| `success` | green | Task completed |
| `error` | red | Blocked, failed, needs urgent attention |
| `warning` | gold | Needs input, approval, or review |
| `info` | azure | General progress update |
| `busy` | orchid | Long task started, still running |

### CLI helper

The repo ships a cross-platform helper (`ping.js` / `ping.sh` / `ping.ps1`) that auto-starts
ping-ping if the server is offline:

```bash
ping-ping -t "Codex 5.5 High" -m "Need your review" -s warning
ping-ping --version          # print version
ping-ping --start-only       # boot the server without sending a ping
```

After `npm link` (or a global install), `ping-ping` works from any folder.

## 📋 API Reference

Base URL: `http://127.0.0.1:19999` (localhost only)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/ping` | Send a notification |
| `GET` | `/health` | Uptime/version check |
| `GET` | `/api/notifications` | History (newest first, `read` flag included) |
| `POST` | `/api/notifications/mark-read` | `{ "all": true }` or `{ "ids": [...] }` |
| `DELETE` | `/api/notifications/:id` | Remove one entry |
| `DELETE` | `/api/notifications` | Clear all history |

**POST /ping body:** `{"title": "string", "message": "string", "status": "success|error|warning|info|busy"}`
— also accepts `application/x-www-form-urlencoded` or URL query params.

**Success:** `202 Accepted` → `{ "ok": true, "id": "…", "ts": "…" }`

**Errors** are structured JSON with a code and hint:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_TITLE",
    "hint": "The `title` field is required and must be a non-empty string."
  }
}
```

### Authentication (optional)

Start the server with `PING_TOKEN` set, and every `POST /ping` must include
`X-PING-TOKEN: <your_token>`. The CLI picks the token up from the same env var automatically.

### Privacy model

The API only accepts local clients (no `Origin` header) and the ping-ping dashboard itself.
Requests carrying a foreign browser `Origin` are rejected with `403` — web pages can neither
read your notification history nor spam pings while you browse. The dashboard ships a strict
CSP and no external network dependencies.

## ⌨️ Dashboard Shortcuts

| Key | Action |
|---|---|
| `/` | Focus search |
| `↑` `↓` | Navigate notifications |
| `C` | Copy selected message |
| `Del` | Delete selected |
| `Esc` | Clear search / close dashboard |

## 🛠️ Built With

- [Electron](https://www.electronjs.org/) — tray + dashboard shell
- [Express](https://expressjs.com/) — local HTTP API
- [node-notifier](https://github.com/mikaelbr/node-notifier) — native notifications
- Vanilla HTML/CSS/JS dashboard — no frameworks, no build step

## 🤝 Contributing

Issues and pull requests are welcome. For bigger changes, open an issue first so we can
discuss the direction.

## 📄 License

[MIT](LICENSE) — created with ❤️ for AI developers by [Aizzul Luqman](https://github.com/itsLucas02).
