# Work Log

Chronological record of all knowledge graph work performed on [[Shift Grabber V9 Index|Shift Grabber V9]].

---

## Session 1 — Vault Creation (2026-04-22)

**Objective:** Convert the Shift Grabber V9 codebase into a navigable Obsidian knowledge graph.

**Method:** 4-agent Ruflo swarm parallel analysis:
1. **Architecture Analyst** → `Architecture Map.md`, `Dependency Graph.md`, `Module Analysis.md`
2. **Component Deep-Diver** → `manifest.json.md`, `main.js.md`, `api-layer.js.md`, `service-worker.js.md`, `popup.js.md`
3. **Data Flow & Security Mapper** → `Data Flow.md`, `Security Audit.md`, `License & Token Lifecycle.md`
4. **Obsidian Wiki Generator** → `Shift Grabber V9 Index.md`, `Components Index.md`, `Flows Index.md`, `Graph View.md`

**Deliverables:** 15 notes, vault registered in Obsidian (`obsidian.json`), flat structure with Title Case wikilinks.

---

## Session 2 — Enhancement & Deepening (2026-04-22)

**Objective:** Add architectural depth, documentation integration, comprehensive cross-linking, and fill every gap.

**New Notes Created (9):**

| # | Note | Purpose | Links |
|---|------|---------|-------|
| 1 | `Popup UI.md` | Deep-dive into `index.html` + `styles.css` design system | 9 |
| 2 | `license.js.md` | Background license verification helper | 10 |
| 3 | `Technical Debt Register.md` | 15 tracked issues by severity (🔴🟡🟢) | 6 |
| 4 | `Configuration Reference.md` | All tunable constants and storage keys | 8 |
| 5 | `External API Contracts.md` | Amazon GraphQL, license server, Telegram specs | 12 |
| 6 | `Project Evolution.md` | Version history (V7→V9→2.0.0) and migration notes | 8 |
| 7 | `Master Document.md` | Canonical vault hub — single source of truth | 56 |
| 8 | `Development & Deployment.md` | Loading, debugging, packaging, CWS submission | 9 |
| 9 | `Assets & Resources.md` | Icons, sounds, web-accessible resources | 7 |

**Root-Level File Created:**
- `../master.md` — Project master reference outside the vault

**Key Discoveries During Enhancement:**
- `popup.js` and `license.js` use **different device ID storage keys** (`SG_deviceId` vs `deviceId`) — functional bug
- `popup.js` contact button links to `https://t.me/shift_grabber` — previously undocumented
- `popup.js` has its own `getDeviceId()` implementation separate from `license.js`
- Version string divergence: "V9" in UI, "2.0.0" in manifest, "V7" in git history
- Git history is a single squashed commit (`9f6d328`)
- No `master.md` existed in the project before this session

**Updates to Existing Notes:**
- All 15 original notes updated with cross-links to new reference notes
- `Shift Grabber V9 Index` Mermaid diagram expanded with purple cluster
- `Graph View` updated to describe 5 clusters (added purple)
- `Flows Index` added quick-reference tables and new flow summaries
- `Components Index` expanded interaction matrix to 7×7

**Quality Assurance:**
- Broken link audit: 0 broken wikilinks
- Total notes: 24
- Total wikilinks: 737+
- Graph config: `graph.json` with 5 colour-coded groups

---

## Session 3 — Architecture Deep-Dive (2026-04-22)

**Objective:** Exhaustively document the communication fabric and state model.

**New Notes Created (3):**

| # | Note | Purpose | Links |
|---|------|---------|-------|
| 10 | `Message Router & State Bus.md` | Every message type, payload, sender, receiver | 18 |
| 11 | `State & Storage Model.md` | chrome.storage.local as state machine | 14 |
| 12 | `Work Log.md` | This note — session history | 4 |

**Key Discoveries:**
- `api-layer.js` uses `window.__SG_EID_SENT` guard to prevent duplicate employee ID broadcasts
- `main.js` waits for `window.__SG_API_LOADED` polling (100 ms × 15 tries = 1.5 s max) before calling `startApiPolling()`
- `chrome.storage.local` operations are non-atomic; race conditions theoretically possible
- Storage quota usage is < 15 KB — no pruning needed
- Three distinct message buses: `runtime.sendMessage`, `tabs.sendMessage`, `window.postMessage`

**Source Code Deep-Dive Discoveries:**
- `service-worker.js` `flushTelegramQueue()` implements **clear-before-send** to prevent double-send on SW restart
- `service-worker.js` `refreshTokenInBackground()` reads `SG_deviceId` (popup key), not `deviceId` (license.js key) — confirming the divergence
- `popup.js` `CONTACT_URL = "https://t.me/shift_grabber"` — previously undocumented Telegram contact link
- `main.js` init polls `window.__SG_API_LOADED` 15 times (100 ms interval, 1.5 s max) before starting API polling
- `api-layer.js` uses `window.__SG_EID_SENT` guard to prevent duplicate employee ID broadcasts
- Telegram message format uses `parse_mode: "HTML"` with emoji + bold formatting

**Ground Rules Established:**
- Added mandatory **5 Ground Rules** to `../master.md` (root-level)
- Rules require: (1) reading graph before coding, (2) verifying mental model, (3) updating graph after every change, (4) no orphaned knowledge, (5) master file wins
- Added Ground Rules reference banner to vault `[[Master Document]]`
- Graph update checklist embedded in rules for every task

**Quality Metrics:**

| Metric | Value |
|--------|-------|
| Total notes | 29 |
| Total wikilinks | 819+ |
| Broken links | 0 |
| Colour clusters | 5 (yellow, green, red, blue, purple) |
| Index notes | 4 |
| Source notes | 9 |
| Architecture notes | 3 |
| Security/Flow notes | 3 |
| Reference notes | 10 |

---

## How to Maintain This Log

When adding new notes or making significant changes:
1. Append a new session entry above this section
2. List new notes, updates, and discoveries
3. Update the quality metrics table
4. Link to [[Technical Debt Register]] if new debt is discovered

---

## Related

- [[Shift Grabber V9 Index]] — Project overview
- [[Master Document]] — Canonical vault hub
- [[Technical Debt Register]] — Issues discovered during sessions
- [[Project Evolution]] — How the extension itself evolved
