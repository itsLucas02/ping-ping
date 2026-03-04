# 🔔 ping-ping — Product Requirements Document

## Overview

**ping-ping** is a lightweight, local-first Windows notification relay for AI agents. It runs as a system tray application that listens for HTTP requests and displays native Windows toast notifications, bridging the communication gap between background AI agents and the user.

## Problem Statement

When using AI agents in terminals (Codex CLI, Claude Code, Gemini CLI, etc.), agents complete tasks silently. Users must manually check each terminal to see if work is done. This is especially painful when:

- Running multiple agents across different terminals/projects
- Stepping away from the computer (browsing, gaming, researching)
- Leaving the room entirely while agents work
- An agent is **waiting for user approval** (e.g., Codex CLI needs permission to run a command) and the user has no idea

**There is no unified, local, simple way for terminal-based AI agents to notify users of task completion or approval requests.**

## Solution

A Windows system tray application with a dead-simple HTTP API that any AI agent can call via `curl`.

```bash
# Agent sends a ping when done
curl -X POST http://localhost:19999/ping ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"Codex CLI\",\"message\":\"Build completed successfully\",\"status\":\"success\"}"
```

The user sees a native Windows toast notification immediately, wherever they are on their PC.

## Target Users

- Developers who use AI coding agents (Codex CLI, Claude Code, Gemini CLI, etc.)
- Power users running multiple agent sessions simultaneously
- Anyone who multitasks while AI agents work in the background

---

## Core Features

### 1. System Tray Application

- Lives in the Windows system tray (notification area)
- Starts minimized — no window clutter
- Right-click context menu: Open Dashboard, Quit
- Tooltip shows app status and port number

### 2. HTTP API Server

- Listens on `localhost:19999` (configurable via config)
- **Endpoints:**

| Method   | Endpoint             | Description                   |
| -------- | -------------------- | ----------------------------- |
| `POST`   | `/ping`              | Send a notification           |
| `GET`    | `/health`            | Health check                  |
| `GET`    | `/api/notifications` | Retrieve notification history |
| `DELETE` | `/api/notifications` | Clear notification history    |

- **POST /ping request body (JSON):**

  ```json
  {
    "title": "Codex CLI",
    "message": "Build completed successfully",
    "status": "success"
  }
  ```

  - `title` (string, required) — Agent name or source identifier
  - `message` (string, required) — The notification body text
  - `status` (string, optional, default: `"info"`) — One of: `"success"`, `"error"`, `"warning"`, `"info"`

- **Response:** `200 OK` with `{ "ok": true, "id": "<notification-id>" }`
- **Errors:** `400 Bad Request` for missing fields or invalid status

### 3. Windows Toast Notifications

- Uses Electron's native `Notification` API for Windows 11 toast notifications
- Shows title, message, and app icon
- Clicking the toast opens the ping-ping dashboard
- Plays the default Windows notification sound

### 4. Notification Dashboard

- A local web UI served by the Electron app
- Opens as a borderless Electron window (not in browser)
- Each notification entry shows: timestamp, agent name, message, status badge
- Color-coded by status:
  - 🟢 **Success** — green
  - 🔴 **Error** — red
  - 🟡 **Warning** — yellow/amber
  - 🔵 **Info** — blue
- Clear history button
- Auto-refreshes with new notifications in real-time
- Accessible via: system tray right-click → "Open Dashboard"

---

## Agent Integration Guide

### How to Connect AI Agents to ping-ping

AI agents running in terminals already have the ability to execute shell commands. The integration is simply a `curl` call.

#### Option A: Include in your prompt/instructions

When prompting an AI agent, add this instruction:

```
When you complete your task, notify me by running:
curl -s -X POST http://localhost:19999/ping -H "Content-Type: application/json" -d "{\"title\":\"<Your Agent Name>\",\"message\":\"<describe what you did and the result>\",\"status\":\"success\"}"

If the task fails, use "status":"error". If you need my approval or attention, use "status":"warning".
```

#### Option B: Add to agent system prompt / custom instructions

For agents that support custom system prompts (like Codex CLI's `codex.md`, Claude Code's `CLAUDE.md`), add the curl instruction permanently so you never have to repeat it.

#### Option C: Use a helper batch script

Create `ping.bat` and place it in your PATH:

```bat
@echo off
curl -s -X POST http://localhost:19999/ping -H "Content-Type: application/json" -d "{\"title\":\"%~1\",\"message\":\"%~2\",\"status\":\"%~3\"}"
```

Then agents simply run: `ping.bat "Codex CLI" "Build done!" "success"`

### Use Case Examples

```bash
# ✅ Task completed successfully
curl -s -X POST http://localhost:19999/ping -H "Content-Type: application/json" ^
  -d "{\"title\":\"Codex CLI\",\"message\":\"All 47 tests passing. Build complete.\",\"status\":\"success\"}"

# ❌ Task failed
curl -s -X POST http://localhost:19999/ping -H "Content-Type: application/json" ^
  -d "{\"title\":\"Claude Code\",\"message\":\"Failed to compile: missing module lodash\",\"status\":\"error\"}"

# ⚠️ Agent needs approval/attention
curl -s -X POST http://localhost:19999/ping -H "Content-Type: application/json" ^
  -d "{\"title\":\"Codex CLI\",\"message\":\"Waiting for approval: wants to run npm install lodash\",\"status\":\"warning\"}"

# ℹ️ Progress update
curl -s -X POST http://localhost:19999/ping -H "Content-Type: application/json" ^
  -d "{\"title\":\"Gemini CLI\",\"message\":\"Phase 1 of 3 complete. Starting phase 2.\",\"status\":\"info\"}"
```

### Approval Relay (v1 Behavior)

In v1, ping-ping provides **one-way notification** for approval requests:

1. Agent hits a point where it needs user approval → sends a `warning` ping
2. User sees the toast: _"⚠️ Codex CLI: Waiting for approval..."_
3. User goes back to the terminal and approves/rejects

This is a massive improvement over the current situation where users have zero indication that an agent is waiting.

> **Future v2**: Two-way approval (approve/reject directly from the notification) is planned but out of scope for v1.

---

## Tech Stack (Final Decision)

| Component           | Technology                     | Rationale                                       |
| ------------------- | ------------------------------ | ----------------------------------------------- |
| Runtime             | **Node.js**                    | Common in dev environments, great ecosystem     |
| Desktop Framework   | **Electron** (tray-only mode)  | Native tray, notifications, embedded dashboard  |
| HTTP Server         | **Express.js**                 | Simple, well-known, minimal setup               |
| Toast Notifications | **Electron Notification API**  | Native Windows 11 toasts, no extra dependencies |
| Dashboard UI        | **Vanilla HTML/CSS/JS**        | No framework overhead, served by Electron       |
| Data Storage        | **JSON file** (in `%APPDATA%`) | Simple notification history persistence         |
| Packaging (future)  | **electron-builder**           | Single `.exe` distribution                      |

---

## Architecture

```
                    AI Agents (Terminal)
                          │
                    curl POST /ping
                          │
                          ▼
┌─────────────────────────────────────────────┐
│              ping-ping (Electron)            │
│                                              │
│  ┌────────────┐    ┌─────────────────────┐   │
│  │ System Tray │    │   Express Server    │   │
│  │    Icon     │    │  localhost:19999    │   │
│  │  ┌───────┐  │    │                     │   │
│  │  │ Menu  │  │    │  POST /ping ─────────>  │ Windows Toast
│  │  │- Dash │  │    │  GET /health        │   │ Notification
│  │  │- Quit │  │    │  GET /api/notif     │   │
│  │  └───────┘  │    │  DELETE /api/notif  │   │
│  └────────────┘    └─────────────────────┘   │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │      Dashboard (Electron Window)       │  │
│  │   Dark theme, glassmorphism, cards     │  │
│  │   📋 Notification history              │  │
│  │   🎨 Color-coded status badges         │  │
│  │   🗑️  Clear history                    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌───────────────┐                           │
│  │ %APPDATA%/    │                           │
│  │ ping-ping/    │                           │
│  │ notifications │  ← JSON file store        │
│  │ .json         │                           │
│  └───────────────┘                           │
└──────────────────────────────────────────────┘
```

---

## User Flow

1. **Start**: Run `npm start` → app appears in system tray (no window)
2. **Idle**: App sits quietly, listening on `localhost:19999`
3. **Agent works**: User prompts an AI agent, then switches to another app
4. **Agent pings**: Agent runs `curl POST /ping` when done
5. **Notification**: Windows toast notification appears with title + message
6. **Review**: Click toast or tray → "Open Dashboard" to see full history

---

## Non-Goals (v1)

- Mobile push notifications
- Cloud/remote notifications — this is local-only
- Agent SDK/library — agents just use `curl`
- Authentication/security — localhost only, no auth needed
- Multi-user support — single user, single machine
- Two-way approval (approve/reject from notification)

## Success Metrics

- Toast notification appears within 1 second of agent's curl call
- App uses < 100MB RAM while idle in system tray (Electron baseline)
- Zero configuration needed to start receiving notifications
- Works on Windows 10 and Windows 11

## Future Considerations (v2+)

- **Two-way approval** — Approve/reject agent actions from the notification
- **CLI helper tool** (`ping-ping "message"`) for even simpler agent integration
- **Sound customization** per status type
- **Do Not Disturb** mode
- **Webhook forwarding** to external services (Slack, Discord, ntfy.sh)
- **Auto-start on boot** option
- **Agent identification** with custom icons/colors per agent
- **Mobile push** via ntfy.sh integration
