# ping-ping

A lightweight, local-first notification relay for AI agents.

**ping-ping** runs as a tray application that listens for HTTP requests and displays native desktop notifications. It provides a simple way for CLI-based AI agents (like Codex CLI, Claude Code, or custom scripts) to notify you when long-running tasks are complete or require attention.

## ✨ Features

- 🍞 **Native Desktop Notifications**: Instant visual feedback for agent tasks.
- 📥 **Simple HTTP API**: Send pings with a single `curl` command.
- 🎨 **Status Levels**: Support for `success`, `error`, `warning`, `info`, and `busy`.
- 📊 **Dashboard**: Filter by status, search, copy messages, delete individual pings, and browse history grouped by day.
- 👁️ **Unread Tracking**: New pings are highlighted until you've seen them; the tray shows the count.
- 🌙 **Pause Mode**: Silence toasts from the tray menu without stopping agents from recording history.
- ⚙️ **Settings**: Sound toggle, launch-at-login, one-click test ping, connection info.
- ⌨️ **Keyboard Shortcuts**: `/` search · `↑`/`↓` navigate · `C` copy · `Del` delete · `Esc` close.
- 🖥️ **Tray App Workflow**: Minimal footprint, runs quietly in the tray/menu bar; window size and position are remembered.
- 🔒 **Local-only API**: Browsers on other websites cannot reach or spam your local relay.

## 🚀 Getting Started

### Prerequisites

- Windows 10 or 11, or macOS
- [Node.js](https://nodejs.org/) (v16+)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/itsLucas02/ping-ping.git
   cd ping-ping
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

The app will start silently in your tray/menu bar.
- Windows: check the taskbar notification area
- macOS: check the menu bar

On first launch on macOS, allow notifications for `Electron` / `ping-ping` when prompted, otherwise the local API can run without visible banners.

`npm start` is safe to run repeatedly: if ping-ping is already healthy on port `19999`, it exits successfully instead of launching a duplicate app.

### Tray menu

- **Pause Notifications** — silence toasts while you focus; pings still land in history.
- **Launch at Login** — start ping-ping when you sign in (starts hidden).
- **Recent pings** — the last five, click one to open the dashboard.
- The tray icon dims while paused and blinks on new arrivals.

## 🤖 Connecting Your AI Agents

Simply tell your AI agent to run a `curl` command when it finishes a task.

### Example Usage (cURL)

If using `curl`, save your payload as `ping.json` and use `--data-binary`:
```bash
curl -X POST http://127.0.0.1:19999/ping \
  -H "Content-Type: application/json" \
  --data-binary @ping.json
```

### Example Usage (Cross-Platform Helper)

The repo now includes a Node-based helper that works on macOS and Windows and can auto-start `ping-ping` if the server is offline:

```bash
./ping.sh --title "Codex" --message "Task successfully completed!" --status success
```

You can also call it directly:

```bash
node ping.js --title "Codex" --message "Task successfully completed!" --status success
```

### Example Usage (PowerShell)

Built-in Windows native method (avoids escaping issues):

```powershell
$body = @{ title='Codex'; message='Task successfully completed!'; status='success' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://127.0.0.1:19999/ping' -Method Post -ContentType 'application/json' -Body $body
```

### Example Usage (ping.ps1 wrapper)

For convenience, a `ping.ps1` helper script is included in the root directory. **If the ping-ping server is not currently running, this script will automatically launch it in the background for you.**

```powershell
.\ping.ps1 -Title "Codex CLI" -Message "Task successfully completed!" -Status success
```

### Example Usage (macOS shell wrapper)

For macOS-friendly usage:

```bash
./ping.sh -Title "Codex CLI" -Message "Task successfully completed!" -Status success
```

### Agent-safe startup

When an AI agent needs to boot ping-ping before sending notifications, use:

```bash
npm start
```

from the ping-ping project folder. This checks whether the local relay is already healthy before launching a new background Electron process.

### Global helper command

After linking/installing this project as a command, agents can use `ping-ping` from any folder:

```bash
ping-ping --title "Codex 5.5 High" --message "Task complete" --status success
```

Short form:

```bash
ping-ping -t "Kimi K2" -m "Need your review" -s warning
```

Agent title guidance:

Agents should fill `--title` with their own agent/model name, not a hardcoded project default. Examples: `Codex 5.5 High`, `Gemini Pro`, `Claude Opus`, `Kimi K2`, `Qwen Coder`, `DeepSeek`, `Z AI`, `OpenCode`, `Cursor Agent`, `Goose`, or `Aider`. The default status is `success`; agents should pass `--status info`, `--status warning`, `--status error`, or `--status busy` for non-completion updates.

### Agent instruction snippet

Owners can add this to a global agent config or a project-level instruction file such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, or similar:

```text
Use ping-ping for status updates. Run `ping-ping --help` if needed.

Ping me when:
- you start a long task: status busy
- you make progress: status info
- you need my input, approval, or review: status warning
- you are blocked or something failed: status error
- you finish successfully: status success

Use your own agent/model name as the title.
```

Run this for formatting help:

```bash
ping-ping --help
```

### Supported Statuses

- `success`: Green (Task complete)
- `error`: Red (Task failed)
- `warning`: Orange (Requires attention)
- `info`: Blue (General update)
- `busy`: Purple (Long task started)

## 📋 API Reference

- `GET /health`
  - Returns: `{ "ok": true, "service": "ping-ping", "version": "1.2.0", "port": 19999, "uptime": 123 }`
- `POST /ping`
  - Body: `{"title": "string", "message": "string", "status": "string"}` (also accepts `application/x-www-form-urlencoded` or URL query params contextually).
  - Returns `202 Accepted` with `{ "ok": true, "id": "...", "ts": "..." }` on success.
- `GET /api/notifications`
  - Retrieve notification history. Entries include a `read` flag.
- `POST /api/notifications/mark-read`
  - Body: `{ "all": true }` or `{ "ids": ["<id>", ...] }`. Returns `{ "ok": true, "updated": n }`.
- `DELETE /api/notifications/:id`
  - Remove a single notification. Returns `404 NOT_FOUND` for unknown ids.
- `DELETE /api/notifications`
  - Clear notification history.

### Local-only access (v1.2.0)

The API now rejects any request carrying a browser `Origin` header other than the
dashboard's own (`null`) or `http://localhost:19999`. Command-line tools and scripts
that send no `Origin` header are unaffected. **Breaking change:** if you previously
called this API from JavaScript on a website, that is blocked by design — web pages
can no longer read your history or spam pings while you browse.

### Error Schema
Failed requests return `400 Bad Request`, `429 Too Many Requests`, or `401 Unauthorized` with a structured JSON error:
```json
{
  "ok": false,
  "error": {
    "code": "MISSING_TITLE",
    "hint": "The `title` field is required and must be a non-empty string."
  }
}
```

### Authentication (Optional)
If the `PING_TOKEN` environment variable is set when launching `ping-ping`, all `POST /ping` requests must include an `X-PING-TOKEN: <your_token>` header.

## 🛠️ Built With

- [Electron](https://www.electronjs.org/)
- [Express.js](https://expressjs.com/)
- [node-notifier](https://github.com/mikaelbr/node-notifier)
- Vanilla HTML/CSS/JS (with Glassmorphism design)

---

_*Created with ❤️ for AI developers by Aizzul Luqman.*_
