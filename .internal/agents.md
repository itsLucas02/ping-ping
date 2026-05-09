# ping-ping — Agent Instructions

## Project Overview

ping-ping is a local tray notification relay for AI agents. It is Electron-based (tray-only mode) with an Express HTTP API that accepts notifications and shows native desktop notifications.

## Tech Stack

- **Runtime**: Node.js + Electron (tray-only, no visible window on startup)
- **HTTP Server**: Express on `localhost:19999`
- **Notifications**: Electron `Notification` API (native Windows toasts)
- **Dashboard**: Vanilla HTML/CSS/JS served by Electron BrowserWindow
- **Storage**:
  - Windows: `%APPDATA%/ping-ping/notifications.json`
  - macOS: `~/Library/Application Support/ping-ping-v2/notifications.json`

## Project Structure

```
ping-ping/
├── PRD.md              ← Product requirements
├── TODO.md             ← Task checklist
├── agents.md           ← This file
├── package.json
├── .gitignore
├── assets/
│   └── icon.png        ← System tray icon (32x32)
└── src/
    ├── main.js         ← Electron main process (tray, notifications, window)
    ├── server.js       ← Express HTTP API
    ├── store.js        ← JSON file notification storage
    ├── config.js       ← Configuration constants
    └── dashboard/
        ├── index.html  ← Dashboard page
        ├── styles.css  ← Dark theme with glassmorphism
        └── app.js      ← Dashboard logic (fetch, render, poll)
```

## API Endpoints

| Method   | Endpoint             | Description                |
| -------- | -------------------- | -------------------------- |
| `POST`   | `/ping`              | Send a notification        |
| `GET`    | `/health`            | Health check               |
| `GET`    | `/api/notifications` | Get notification history   |
| `DELETE` | `/api/notifications` | Clear notification history |

### POST /ping body

```json
{
  "title": "Agent Name",
  "message": "Task completed",
  "status": "success"
}
```

- `status` options: `success`, `error`, `warning`, `info`, `busy` (default: `info`)

## Key Design Decisions

1. **Electron tray-only mode** — no visible window on startup, only system tray icon
2. **Express runs inside Electron** — single process, no extra server
3. **JSON flat file** — simple persistence, capped at 500 notifications
4. **Dashboard hides on close** — never destroyed, just toggled with tray menu
5. **No authentication** — localhost only, security not needed for v1

## Development Commands

```bash
npm install       # Install dependencies
npm start         # Run the app (Electron)
npm run ping -- --title "Codex" --message "Hello" --status info
```

## Integration with Codex CLI

To have your Codex CLI agent use **ping-ping** for all updates, approvals, and completions, add the following to its workflow or system instructions.

### Recommended Commands (Cross-Platform)

**Best if installed globally: use the `ping-ping` command.**
It auto-starts the local ping-ping app if needed, then sends the notification.

```powershell
ping-ping --title "Codex 5.5 High" --message "[Your Message Here]" --status success
```

Run `ping-ping --help` for formatting and status meanings. The `--title` value should be your own agent/model name. Do not use generic names like `Agent` when you can identify yourself. Examples: `Codex 5.5 High`, `Gemini Pro`, `Claude Opus`, `Kimi K2`, `Qwen Coder`, `DeepSeek`, `Z AI`, `OpenCode`, `Cursor Agent`, `Goose`, or `Aider`.

For progress, approval, blocked, or long-running notifications, always pass the explicit `--status` value.

If the global command is unavailable, prefer the helper scripts over raw `curl`.

- macOS / Linux:

```bash
./ping.sh --title "Codex" --message "[Your Message Here]" --status "[status]"
```

- Windows:

```powershell
.\ping.ps1 -Title "Codex" -Message "[Your Message Here]" -Status "[status]"
```

If a helper script is available in the workspace, always prefer it over `curl`. The helpers handle JSON encoding natively and can automatically launch the ping-ping app in the background if it is offline.

If the helper is *not* available, avoid using inline JSON with `curl` on Windows. Instead, use the native `Invoke-RestMethod` command:

```powershell
$body = @{ title='Codex'; message='[Your Message Here]'; status='[status]' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://127.0.0.1:19999/ping' -Method Post -ContentType 'application/json' -Body $body
```

### Protocol for Codex
Use the following instruction to ensure Codex pings you for everything:

> "Use the `ping-ping` tool (`http://localhost:19999/ping`) to notify me about **every** significant event. Do not wait for long-running tasks; use it for:
> - **Completion** (Short or long): Use `status: "success"`
> - **Questions/Approvals**: Use `status: "warning"`
> - **Permissions Required**: Use `status: "error"` (to get my attention immediately)
> - **General Progress**: Use `status: "info"`
> - **Long Tasks Started**: Use `status: "busy"`
>
> Always send a ping immediately when you are blocked or have finished a step."

### Mandatory Owner-Attention Rule

- If the owner needs to answer a question, approve an action, review a result, or is otherwise needed to unblock progress, send a ping immediately.
- Do not wait for the final reply if owner attention is needed now.
- Recommended mapping:
  - Owner input / questions / approvals: `status: "warning"`
  - Immediate attention / blocked / something failed: `status: "error"`
  - Routine progress / answer ready: `status: "info"`
