# 🔔 ping-ping

A lightweight, local-first Windows notification relay for AI agents.

**ping-ping** runs as a system tray application that listens for HTTP requests and displays native Windows toast notifications. It provides a simple way for CLI-based AI agents (like Codex CLI, Claude Code, or custom scripts) to notify you when long-running tasks are complete or require attention.

## ✨ Features

- 🍞 **Native Windows Toasts**: Instant visual feedback for agent tasks.
- 📥 **Simple HTTP API**: Send pings with a single `curl` command.
- 🎨 **Status Levels**: Support for `success`, `error`, `warning`, `info`, and `busy`.
- 📊 **Glassmorphism Dashboard**: View a beautiful history of all recent notifications.
- 🌓 **Windows Native Integration**: Minimal footprint, runs in the system tray.

## 🚀 Getting Started

### Prerequisites

- Windows 10 or 11
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

The app will start silently in your **System Tray** (check the taskbar notification area).

## 🤖 Connecting Your AI Agents

Simply tell your AI agent to run a `curl` command when it finishes a task.

### Example Usage (cURL)

**⚠️ Note for Windows Users**: Inline JSON in `curl` can often fail due to shell escaping. It's safer to use a payload file or PowerShell (see below).

If using `curl`, save your payload as `ping.json` and use `--data-binary`:
```bash
curl.exe -X POST http://localhost:19999/ping ^
  -H "Content-Type: application/json" ^
  --data-binary @ping.json
```

### Example Usage (PowerShell)

Built-in Windows native method (avoids escaping issues):

```powershell
$body = @{ title='Codex'; message='Task successfully completed!'; status='success' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://127.0.0.1:19999/ping' -Method Post -ContentType 'application/json' -Body $body
```

### Example Usage (ping.ps1 wrapper)

For convenience, a `ping.ps1` helper script is included in the root directory:

```powershell
.\ping.ps1 -Title "Codex CLI" -Message "Task successfully completed!" -Status success
```

### Supported Statuses

- `success`: Green (Task complete)
- `error`: Red (Task failed)
- `warning`: Orange (Requires attention)
- `info`: Blue (General update)
- `busy`: Purple (Long task started)

## 📋 API Reference

- `GET /health`
  - Returns: `{ "ok": true, "service": "ping-ping", "uptime": 123 }`
- `POST /ping`
  - Body: `{"title": "string", "message": "string", "status": "string"}` (also accepts `application/x-www-form-urlencoded` or URL query params contextually).
  - Returns `202 Accepted` with `{ "ok": true, "id": "...", "ts": "..." }` on success.
- `GET /api/notifications`
  - Retrieve notification history.
- `DELETE /api/notifications`
  - Clear notification history.

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
