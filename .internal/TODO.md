# 📋 ping-ping — Project To-Do List

## ✅ Planning (Completed)

- [x] Research existing notification solutions (ntfy.sh, BurntToast, etc.)
- [x] Create PRD.md — product requirements document
- [x] Create implementation plan with file specs and dependencies
- [x] Define agent integration guide (curl, prompt, batch script)
- [x] Define approval relay behavior (v1: one-way notification)
- [x] Create TODO.md
- [x] Create agents.md
- [x] Initialize Git repo and push to GitHub

## 🔨 Implementation (Pending)

- [ ] Project setup — `package.json`, `.gitignore`, install dependencies
- [ ] Configuration — `src/config.js`
- [ ] Notification store — `src/store.js` (JSON file persistence)
- [ ] HTTP API server — `src/server.js` (Express endpoints)
- [ ] Electron main process — `src/main.js` (tray icon, notifications, dashboard window)
- [ ] Generate tray icon asset — `assets/icon.png`
- [ ] Dashboard HTML — `src/dashboard/index.html`
- [ ] Dashboard CSS — `src/dashboard/styles.css` (dark theme, glassmorphism)
- [ ] Dashboard JS — `src/dashboard/app.js` (fetch, render, polling)

## 🧪 Verification (Pending)

- [ ] Test health endpoint (`GET /health`)
- [ ] Test ping endpoint — success, error, warning, info statuses
- [ ] Test input validation — missing fields, invalid status
- [ ] Test notification history (`GET /api/notifications`)
- [ ] Test clear history (`DELETE /api/notifications`)
- [ ] Verify system tray icon appears
- [ ] Verify Windows toast notifications pop up
- [ ] Verify dashboard displays notification history correctly
- [ ] Verify persistence across app restart
- [ ] End-to-end test: simulate agent workflow with multiple pings

## 🚀 Future (v2+)

- [ ] Two-way approval — approve/reject from notification
- [ ] CLI helper tool (`ping-ping "message"`)
- [ ] Sound customization per status type
- [ ] Do Not Disturb mode
- [ ] Webhook forwarding (Slack, Discord, ntfy.sh)
- [ ] Auto-start on boot
- [ ] Agent identification with custom icons/colors
- [ ] Package as single `.exe` with electron-builder
