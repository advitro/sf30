# Shift Grabber V9 — Master Document

> **Canonical project reference.** If this file contradicts any other document, this one wins — and the discrepancy should be logged as debt.

---

## ⚠️ Ground Rules — Mandatory for All Contributors

These rules are non-negotiable. They exist so that every change is traceable, every decision is documented, and no one ever works in the dark.

### Rule 1: Read the Graph Before You Touch the Code

Before modifying **any** file in this project, you **must** consult the Obsidian knowledge graph:

1. Open the vault (`Shift Grabber Knowledge Graph/`) in Obsidian
2. Start at `[[Shift Grabber V9 Index]]` or `[[Master Document]]`
3. Read the notes for every file you plan to change
4. Check `[[Technical Debt Register]]` for known issues in those areas
5. Check `[[Configuration Reference]]` for tunable values that might be affected
6. Check `[[Message Router & State Bus]]` if your change affects inter-module communication

**Why:** The codebase has hidden couplings (storage key names, message types, alarm timing). Changing one file without understanding its downstream effects has caused regressions before.

### Rule 2: Verify Your Mental Model in the Graph

Before writing code, verify your understanding:

| Question | Where to Check |
|----------|---------------|
| Which files will my change touch? | `[[Dependency Graph]]` |
| What messages does this module send/receive? | `[[Message Router & State Bus]]` |
| What storage keys are involved? | `[[State & Storage Model]]` + `[[Configuration Reference]]` |
| Are there known issues in this area? | `[[Technical Debt Register]]` |
| What's the security surface? | `[[Security Audit]]` |
| How does this fit into the overall architecture? | `[[Architecture Map]]` |
| What are the performance implications? | `[[Performance Characteristics]]` |

If you cannot answer all of these, **do not start coding yet**. Keep reading until the graph answers your questions.

### Rule 3: Update the Graph with Every Change

**Every task, prompt, or PR must update the knowledge graph.** This is not optional documentation — it is part of the codebase.

After completing any work, you **must**:

1. **Update affected leaf notes** — If you changed `main.js`, update `[[main.js]]` with new function signatures, changed constants, or new message types
2. **Update architecture notes** — If your change affects module boundaries, update `[[Architecture Map]]`, `[[Dependency Graph]]`, or `[[Module Analysis]]`
3. **Update security/flow notes** — If your change affects data flow or security posture, update `[[Data Flow]]`, `[[Security Audit]]`, or `[[License & Token Lifecycle]]`
4. **Update the debt register** — If you fixed a debt item, mark it resolved in `[[Technical Debt Register]]`. If you discovered new debt, add it.
5. **Update configuration reference** — If you added/changed/removed any constant, update `[[Configuration Reference]]`
6. **Log the work** — Append a session entry to `[[Work Log]]` documenting what changed and why
7. **Run the link checker** — Verify no broken wikilinks exist after your edits

**Graph update checklist (copy into every task):**
```
- [ ] Leaf source notes updated
- [ ] Architecture notes updated (if boundaries changed)
- [ ] Security/flow notes updated (if behaviour changed)
- [ ] Technical Debt Register updated
- [ ] Configuration Reference updated
- [ ] Work Log updated
- [ ] Broken link check passed
```

### Rule 4: No Orphaned Knowledge

Every concept in the codebase must exist in the graph. If you introduce:
- A new message type → add it to `[[Message Router & State Bus]]`
- A new storage key → add it to `[[Configuration Reference]]` and `[[State & Storage Model]]`
- A new external API call → add it to `[[External API Contracts]]`
- A new timing constant → add it to `[[Configuration Reference]]`
- A new file/module → create a new leaf note and link it from `[[Components Index]]`

If it exists in code but not in the graph, **it does not exist** for future maintainers.

### Rule 5: This File Wins

If any document (including this one) contradicts the code, the code is wrong until the discrepancy is resolved. If two vault notes contradict each other, `[[Master Document]]` wins. If `[[Master Document]]` and this file contradict each other, **this file wins**.

All discrepancies must be logged in `[[Technical Debt Register]]` until resolved.

---

## Project Identity

| | |
|---|---|
| **Name** | Shift Grabber V9 |
| **Type** | Chrome Extension (Manifest V3) |
| **Manifest Version** | `2.0.0` |
| **Product Name** | V9 |
| **Purpose** | Auto-detect and claim Amazon AtoZ warehouse shifts via GraphQL polling + DOM backup |
| **Platforms** | Windows, macOS, Linux (any Chromium browser) |
| **Total LOC** | ~2,096 (production) + 0 (tests) |
| **License Model** | Proprietary per-device server-gated license |

---

## Architecture at a Glance

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

## File Registry

| File | World | Role | Lines | Deep Dive |
|------|-------|------|-------|-----------|
| `manifest.json` | — | MV3 declaration | 29 | Vault: [[manifest.json]] |
| `src/content/main.js` | ISOLATED | HUD, keyboard, DOM backup, bridge | ~650 | Vault: [[main.js]] |
| `src/content/api-layer.js` | MAIN | GraphQL polling, claiming, rate limits | ~220 | Vault: [[api-layer.js]] |
| `background/service-worker.js` | Background | Scheduling, alarms, token, Telegram | ~380 | Vault: [[service-worker.js]] |
| `background/license.js` | Background | Token verification wrapper | 41 | Vault: [[license.js]] |
| `popup/popup.js` | Popup | Event handlers, state, license UI | ~420 | Vault: [[popup.js]] |
| `popup/index.html` | Popup | DOM structure | 87 | Vault: [[Popup UI]] |
| `popup/styles.css` | Popup | Design system + layout | 269 | Vault: [[Popup UI]] |
| `icons/*.png` | — | Extension icons (16/48/128) | — | — |
| `sounds/click.mp3` | Web-accessible | Alert on shift claim | — | — |

---

## Critical Execution Path

1. **User opens AtoZ tab** → content scripts inject
2. **api-layer polls** → every 1 s (500 ms turbo) POST to Amazon GraphQL
3. **Shift appears** → `fireClaim()` fires 3 staggered mutations
4. **Claim succeeds** → `postMessage` to `main.js`
5. **main.js reacts** → toast + flash + sound + Telegram queue
6. **Service worker flushes** → next alarm sends Telegram message
7. **DOM backup runs** → every 800 ms scans for "Add Shift" buttons as fallback

Full trace: see Vault note [[Data Flow]].

---

## Key Architectural Decisions

| Decision | Rationale | Consequence |
|----------|-----------|-------------|
| **MAIN world injection** for api-layer | Bypasses CORS + reads page cookies/CSRF natively | Runs in untrusted page context; Amazon can detect injected script |
| **Alarm-based scheduling** in SW | MV3 service workers are ephemeral; `setInterval` dies | Complex burst-anchor math; relies on browser alarm accuracy |
| **postMessage bridge** between worlds | Only observable communication channel between ISOLATED and MAIN | No type safety; messages can be spoofed by page scripts |
| **7-day window per tab** | Single API call covers a week vs 1 tab per day | Huge bandwidth/efficiency win; tab management simplified |
| **Dual claim method** (API + DOM) | API is fast but invisible; DOM is slow but visible | Two code paths to maintain; DOM backup is fragile |
| **Server-gated license** | Revenue protection; per-device binding | Requires internet; single point of failure if server down |
| **Hardcoded Telegram** | Quick implementation of push notifications | **Critical security risk** — token exposed in source |

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

Full registry: see Vault note [[Configuration Reference]].

---

## Security Posture

| Risk | Severity | Tracker |
|------|----------|---------|
| Hardcoded Telegram bot token + chat ID | 🔴 Critical | Vault: [[Security Audit]] #1 |
| No input validation on GraphQL responses | 🔴 Critical | Vault: [[Technical Debt Register]] #2 |
| No sender validation on SW messages | 🟡 Medium | Vault: [[Technical Debt Register]] #7 |
| Employee ID scraping fragility | 🟡 Medium | Vault: [[Technical Debt Register]] #6 |
| Token refresh race condition | 🟡 Medium | Vault: [[Technical Debt Register]] #8 |
| No test suite | 🟢 Low | Vault: [[Technical Debt Register]] #9 |

---

## External API Surface

| Service | URL | Purpose | Contract Doc |
|---------|-----|---------|--------------|
| Amazon GraphQL | `atoz-apps.amazon.work/apis/ScheduleManagementService/graphql` | Shift discovery + claiming | Vault: [[External API Contracts]] |
| License Server | `shift-grabber.vercel.app/verify` | Key validation + token refresh | Vault: [[External API Contracts]] |
| Telegram Bot | `api.telegram.org/bot{TOKEN}/sendMessage` | Claim notifications | Vault: [[External API Contracts]] |

---

## Keyboard Shortcuts

| Shortcut | Action | Defined In |
|----------|--------|------------|
| `P` | Pause / resume polling | `main.js` |
| `Shift+O` | Override mode (fast reloads) | `main.js` |
| `Shift+H` | Toggle HUD visibility | `main.js` |
| `R` | Reload all AtoZ tabs now | `main.js` |
| `Shift+T` | Turbo mode (500 ms polling) | `main.js` |

---

## Version History

| Version | Evidence | Likely Changes |
|---------|----------|----------------|
| V7 | Git commit `9f6d328` | Original DOM-only grabber; likely MV2 |
| V8 | Inferred | MV3 migration, service worker introduction |
| V9 / 2.0.0 | Manifest + HUD badge + popup | License system, GraphQL polling, turbo mode, HUD, Telegram |

> Git history shows only one commit (`9f6d328`). The V7→V9 jump suggests a major rewrite with squashed history.

---

## Known Issues (Live Register)

1. **License verification duplicated** in `popup.js` and `license.js` — same endpoint, two implementations.
2. **Storage key names not centralised** — `main.js`, `popup.js`, and `service-worker.js` each maintain their own `KEYS` object.
3. **Magic numbers scattered** — 800, 4000, 250, 1000, 500, 120, 100, 200 appear throughout with no single source of truth.
4. **No exponential backoff** on rate limits — fixed 5 s / 30 s recovery.
5. **Accessibility gaps** in popup — no ARIA labels, colour-only state indicators.
6. **Version string drift** — "V9" in UI, "2.0.0" in manifest, "V7" in git history.

Full debt register: see Vault note [[Technical Debt Register]].

---

## Development Workflow

### Loading the Extension (Unpacked)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the project root folder (`atoz - tg ready`)
5. Extension appears with icon in toolbar

### Making Changes

- **Content scripts**: Reload the AtoZ tab after file changes
- **Service worker**: Click the refresh icon on the extension card in `chrome://extensions/`
- **Popup**: Close and reopen the popup (no extension reload needed for HTML/CSS/JS changes)

### Obsidian Knowledge Graph

The project maintains a companion Obsidian vault for architectural documentation:

- **Vault location:** `Shift Grabber Knowledge Graph/`
- **Open in Obsidian:** Vault is pre-registered in `obsidian.json`
- **Graph view:** Press `Ctrl/Cmd + G` inside Obsidian
- **Note count:** 29 notes, 819+ wikilinks, 5 colour-coded clusters, 0 broken links
- **Key deep-dives:**
  - [[Message Router & State Bus]] — Every inter-module message catalogued
  - [[State & Storage Model]] — How `chrome.storage.local` acts as the state machine
  - [[Technical Debt Register]] — 15 tracked issues by severity
  - [[External API Contracts]] — Amazon GraphQL, license server, Telegram specs
  - [[Configuration Reference]] — All tunable constants and storage keys

Start exploring at vault note: [[Shift Grabber V9 Index]]

---

## Tags

#chrome-extension #manifest-v3 #shift-grabber #amazon-atoz #automation #knowledge-graph
