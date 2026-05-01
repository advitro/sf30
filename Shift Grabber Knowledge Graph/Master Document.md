# Master Document

The canonical reference for [[Shift Grabber V9 Index|Shift Grabber V9]]. This note ties together architecture, implementation, security, configuration, and evolution into a single navigable entry point.

> **⚠️ Ground Rules apply.** Before making any change to this project, read the Ground Rules in `../master.md` (the root-level master document). They mandate consulting the knowledge graph before coding and updating the graph after every change.

---

## At a Glance

| | |
|---|---|
| **Name** | Shift Grabber V9 |
| **Type** | Chrome Extension (Manifest V3) |
| **Version** | 2.0.0 (manifest) / V9 (product) |
| **Purpose** | Auto-detect and claim Amazon AtoZ warehouse shifts |
| **Platforms** | Windows, macOS, Linux (any Chromium browser) |
| **Total LOC** | ~2,096 (production) + 0 (tests) |
| **License** | Proprietary — server-gated per-device |

---

## Architecture in One Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│  ┌─────────────────┐    ┌─────────────────────────────┐    │
│  │   POPUP UI      │    │      ATOZ TAB               │    │
│  │  index.html     │◄──►│  ┌─────────┐ ┌──────────┐  │    │
│  │  styles.css     │    │  │ main.js │ │api-layer │  │    │
│  │  popup.js       │    │  │ISOLATED │◄►│  MAIN    │  │    │
│  └────────┬────────┘    │  │  world  │ │  world   │  │    │
│           │ messages    │  └────┬────┘ └────┬─────┘  │    │
│           │             │       │   postMessage      │    │
│           ▼             │       │                 │    │
│  ┌─────────────────┐    │       ▼                 │    │
│  │ SERVICE WORKER  │    │  ┌──────────────┐      │    │
│  │ service-worker  │◄───┘  │ Amazon GraphQL│◄─────┘    │
│  │ license.js      │       │   API         │           │
│  └────────┬────────┘       └──────────────┘           │
│           │ alarms / fetch                              │
│           ▼                                             │
│  ┌─────────────────────────────────────────┐             │
│  │  License Server  |  Telegram API        │             │
│  │  (Vercel)        |  (hardcoded bot)     │             │
│  └─────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

---

## Module Registry

| Module | File | World | Role | Deep Dive |
|--------|------|-------|------|-----------|
| Manifest | `manifest.json` | — | MV3 declaration, permissions, entry points | [[manifest.json]] |
| Main Content | `src/content/main.js` | ISOLATED | HUD, keyboard, DOM backup, bridge | [[main.js]] |
| API Layer | `src/content/api-layer.js` | MAIN | GraphQL polling, claiming, rate limits | [[api-layer.js]] |
| Service Worker | `background/service-worker.js` | Background | Scheduling, alarms, token, Telegram | [[service-worker.js]] |
| License Helper | `background/license.js` | Background | Token verification wrapper | [[license.js]] |
| Popup Logic | `popup/popup.js` | Popup | Event handlers, state, license UI | [[popup.js]] |
| Popup UI | `popup/index.html` + `styles.css` | Popup | Visual control surface | [[Popup UI]] |

---

## Critical Path — How a Shift Gets Claimed

1. **User opens AtoZ tab** → `main.js` + `api-layer.js` inject via [[manifest.json]] content scripts
2. **api-layer starts polling** → Every 1 s (or 500 ms turbo) POST to Amazon GraphQL
3. **Shift appears** → `fireClaim()` fires 3 staggered mutation attempts
4. **Claim succeeds** → `postMessage` to `main.js` with result
5. **main.js reacts** → Toast + flash + sound + Telegram queue entry
6. **Service worker flushes** → Next `SG_TOKEN_CHECK` alarm sends Telegram message
7. **DOM backup runs** → Every 800 ms `main.js` scans for "Add Shift" buttons as fallback

Full flow: [[Data Flow]]  
Performance numbers: documented in [[Project Evolution]] and source notes

---

## Security Posture Summary

| Risk | Severity | Location | Tracker |
|------|----------|----------|---------|
| Hardcoded Telegram credentials | 🔴 Critical | `service-worker.js` | [[Security Audit]], [[Technical Debt Register]] #1 |
| No input validation on GraphQL | 🔴 Critical | `api-layer.js` | [[Technical Debt Register]] #2 |
| No sender validation in SW | 🟡 Medium | `service-worker.js` | [[Technical Debt Register]] #7 |
| Employee ID scraping fragility | 🟡 Medium | `api-layer.js` | [[Technical Debt Register]] #6 |
| Token refresh race condition | 🟡 Medium | `popup.js` / `service-worker.js` | [[Technical Debt Register]] #8 |

Complete audit: [[Security Audit]]

---

## Configuration Quick Reference

| Tune | File | Constant | Default |
|------|------|----------|---------|
| Poll interval | `api-layer.js` | `pollInterval` | 1000 ms |
| Turbo interval | `api-layer.js` | `pollInterval` (turbo) | 500 ms |
| Rate-limit backoff | `api-layer.js` | `rateLimitPollMs` | 5000 ms |
| Burst reload delay | `service-worker.js` | `BASE_MS` | 4000 ms |
| Burst jitter | `service-worker.js` | `JITTER_MS` | 250 ms |
| Token check alarm | `service-worker.js` | `TOKEN_CHECK_INTERVAL_MS` | 120000 ms |
| HUD update rate | `main.js` | `HUD_REFRESH_MS` | 800 ms |
| DOM scan rate | `main.js` | `DOM_SCAN_MS` | 800 ms |

Full registry: [[Configuration Reference]]

---

## External Dependencies

| Service | URL | Purpose | Contract |
|---------|-----|---------|----------|
| Amazon GraphQL | `atoz-apps.amazon.work/apis/ScheduleManagementService/graphql` | Shift discovery + claiming | [[External API Contracts]] #1 |
| License Server | `shift-grabber.vercel.app/verify` | Key validation | [[External API Contracts]] #2 |
| Telegram Bot | `api.telegram.org` | Claim notifications | [[External API Contracts]] #3 |

---

## Knowledge Graph Map

### Index Notes (yellow)
- [[Shift Grabber V9 Index]] — Project overview
- [[Components Index]] — All modules
- [[Flows Index]] — Execution paths
- [[Graph View]] — How to use the Obsidian graph

### Architecture Notes (green)
- [[Architecture Map]] — High-level structure
- [[Dependency Graph]] — File relationships
- [[Module Analysis]] — Depth, coupling, testability

### Security / Flow Notes (red)
- [[Data Flow]] — End-to-end data paths
- [[Security Audit]] — Risk analysis
- [[License & Token Lifecycle]] — Token flow

### Source Notes (blue)
- [[manifest.json]] — MV3 manifest
- [[main.js]] — ISOLATED content script
- [[api-layer.js]] — MAIN world content script
- [[service-worker.js]] — Background scheduler
- [[popup.js]] — Popup logic
- [[Popup UI]] — Popup HTML/CSS
- [[license.js]] — Background license helper
- [[Assets & Resources]] — Icons, sounds, web-accessible resources
- [[Development & Deployment]] — Loading, debugging, shipping

### Reference Notes (purple)
- **[[Master Document]]** — This note
- [[Configuration Reference]] — Constants registry
- [[External API Contracts]] — Network contracts
- [[Technical Debt Register]] — Known issues
- [[Project Evolution]] — Version history
- [[Development & Deployment]] — Developer workflow and release
- [[Assets & Resources]] — Non-code artifact documentation
- [[Message Router & State Bus]] — Exhaustive message type catalog
- [[State & Storage Model]] — chrome.storage.local as state machine
- [[MV3 Platform Constraints]] — How MV3 shaped every decision
- [[Performance Characteristics]] — Latency, load, bandwidth, scaling
- [[Error Handling & Resilience]] — Failure handling across all modules
- [[Work Log]] — Session history and discovery log

---

## How to Navigate This Vault

1. **First time?** Start at [[Shift Grabber V9 Index]]
2. **Understanding code?** Pick the source note (e.g., [[main.js]])
3. **Seeing the big picture?** Open [[Architecture Map]] + [[Dependency Graph]]
4. **Planning changes?** Read [[Technical Debt Register]] + [[Module Analysis]]
5. **Security review?** Go to [[Security Audit]]
6. **Graph visualisation** — Press `Ctrl/Cmd + G` in Obsidian for the 3D node graph

---

## Maintenance Log

| Date | Action | Agent |
|------|--------|-------|
| 2026-04-22 | Vault created with 15 notes | 4-agent Ruflo swarm |
| 2026-04-22 | Enhanced with 8 additional notes | Architecture + documentation deep-dive |

---

> **This document is the single source of truth.** If you find contradictions between this note and any other, this note wins — and the discrepancy should be added to [[Technical Debt Register]].
