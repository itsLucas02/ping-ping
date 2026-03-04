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

```bash
# In your terminal or as an agent command:
curl.exe -X POST http://localhost:19999/ping ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"My AI Assistant\", \"message\":\"Task successfully completed!\", \"status\":\"success\"}"
```

### Supported Statuses

- `success`: Green (Task complete)
- `error`: Red (Task failed)
- `warning`: Orange (Requires attention)
- `info`: Blue (General update)
- `busy`: Purple (Long task started)

## 📋 API Reference

- `GET /health`: Check if the server is running.
- `POST /ping`: Send a notification.
  - Body: `{"title": "string", "message": "string", "status": "string"}`
- `GET /api/notifications`: Retrieve notification history.
- `DELETE /api/notifications`: Clear notification history.

## 🛠️ Built With

- [Electron](https://www.electronjs.org/)
- [Express.js](https://expressjs.com/)
- [node-notifier](https://github.com/mikaelbr/node-notifier)
- Vanilla HTML/CSS/JS (with Glassmorphism design)

---

_*Created with ❤️ for AI developers by Aizzul Luqman.*_
