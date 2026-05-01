# Components Index

This note aggregates every source-file note in the Shift Grabber V9 vault. Use it as a quick directory for component-level details, interaction patterns, and onboarding.

## Component Directory

| Component | Role | LOC | Functions | Key Dependencies |
|-----------|------|-----|-----------|------------------|
| [[manifest.json]] | Declares MV3 permissions, host matches, content scripts, and web-accessible resources. | 46 | — | Chrome extension loader |
| [[main.js]] | Content script that renders the HUD, backs up the DOM, and handles keyboard shortcuts. | 624 | 24 | `chrome.storage`, `chrome.runtime`, DOM APIs |
| [[api-layer.js]] | Injected MAIN-world script for GraphQL polling, shift detection, and automated claiming. | 292 | 10 | `fetch`, `document.cookie`, GraphQL endpoint |
| [[service-worker.js]] | Background service worker managing alarm scheduling, token refresh, and Telegram push notifications. | 363 | 12 | `chrome.alarms`, `chrome.storage`, Telegram Bot API |
| [[popup.js]] | Browser-action popup logic for settings, manual triggers, and license status display. | 308 | 10 | `chrome.storage`, `chrome.runtime`, `chrome.tabs` |
| [[Popup UI]] | Visual control surface: HTML structure + CSS design system. | 356 | — | `popup.js` |
| [[license.js]] | Background license verification helper (imported by service worker). | 41 | 3 | `fetch`, `chrome.storage` |
| [[Assets & Resources]] | Icons, sounds, and web-accessible resource declarations. | — | — | `manifest.json` |
| [[Development & Deployment]] | Developer workflow, debugging, and release packaging. | — | — | All modules |
| [[Message Router & State Bus]] | Exhaustive catalog of all inter-module messages. | — | — | All modules |
| [[State & Storage Model]] | chrome.storage.local architecture and state machine. | — | — | All modules |
| [[MV3 Platform Constraints]] | How Manifest V3 shaped every design decision. | — | — | All modules |
| [[Performance Characteristics]] | Latency, load, bandwidth, and scaling limits. | — | — | All modules |

## Component Interaction Matrix

|  | manifest.json | main.js | api-layer.js | service-worker.js | popup.js | Popup UI | license.js |
|--|:-------------:|:-------:|:------------:|:-----------------:|:--------:|:--------:|:----------:|
| **manifest.json** | — | Declares injection | Declares WAR | Declares SW scope | Declares popup | Declares popup | Declares SW |
| **main.js** | Host match | — | postMessage bridge | `runtime.sendMessage` | `tabs.sendMessage` | — | — |
| **api-layer.js** | WAR access | postMessage bridge | — | — | — | — | — |
| **service-worker.js** | Alarm registration | `tabs.reload` | — | — | `runtime.sendMessage` | — | imports |
| **popup.js** | — | `tabs.sendMessage` | — | `runtime.sendMessage` | — | DOM owns | — |
| **Popup UI** | — | — | — | — | DOM owned by | — | — |
| **license.js** | — | — | — | imported by | — | — | — |

**Key**: Arrows indicate primary direction of runtime communication.

## Suggested Reading Order

1. **[[manifest.json]]** — Understand declared capabilities and permission boundaries before reading code.
2. **[[Architecture Map]]** — Get the high-level mental model.
3. **[[main.js]]** — The user-facing entry point; HUD and keyboard shortcuts.
4. **[[api-layer.js]]** — Core business logic; see how shifts are polled and claimed.
5. **[[service-worker.js]]** — Background automation and token orchestration.
6. **[[popup.js]]** — Control surface logic.
7. **[[Popup UI]]** — Visual design and HTML structure.
8. **[[license.js]]** — Background verification helper.
9. **[[Data Flow]]** — Trace messages end-to-end after you know the components.
10. **[[Security Audit]]** — Validate assumptions about secrets and transport security.
11. **[[Configuration Reference]]** — Review tunable values.
12. **[[Technical Debt Register]]** — Understand known issues before changing code.

## Related Notes

- [[Shift Grabber V9 Index]]
- [[Flows Index]]
- [[Graph View]]
- [[Architecture Map]]
- [[Dependency Graph]]
- [[Module Analysis]]
- [[Popup UI]]
- [[license.js]]
- [[Configuration Reference]]
- [[Technical Debt Register]]
