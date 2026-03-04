# ping-ping — Agent Instructions

## Project Overview

ping-ping is a Windows system tray notification relay for AI agents. It's an Electron app (tray-only mode) with an Express HTTP API that accepts notifications and shows native Windows toast notifications.

## Tech Stack

- **Runtime**: Node.js + Electron (tray-only, no visible window on startup)
- **HTTP Server**: Express on `localhost:19999`
- **Notifications**: Electron `Notification` API (native Windows toasts)
- **Dashboard**: Vanilla HTML/CSS/JS served by Electron BrowserWindow
- **Storage**: JSON file at `%APPDATA%/ping-ping/notifications.json`

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

- `status` options: `success`, `error`, `warning`, `info` (default: `info`)

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
```

## When making changes

- Run `npm start` to test after changes
- Test API with curl: `curl -X POST http://localhost:19999/ping -H "Content-Type: application/json" -d "{\"title\":\"Test\",\"message\":\"Hello\",\"status\":\"success\"}"`
- Check the PRD.md for full requirements and the TODO.md for current progress
