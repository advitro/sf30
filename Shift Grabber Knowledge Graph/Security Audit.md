# Security Audit

> **Project:** [[Shift Grabber V9 Index]]  
> **Scope:** Secrets exposure, permission attack surface, CSRF handling, rate limiting, input validation, transport security, and privacy impact.  
> **Sources:** [[service-worker.js]], [[api-layer.js]], [[main.js]], [[popup.js]], [[manifest.json]]

## 1. Secrets Exposure Analysis

### 1.1 Telegram Bot Token — CRITICAL
- **File:** `service-worker.js`  
- **Line:** `4`  
- **Finding:** `const TG_BOT_TOKEN = "8528351436:AAFzN8eMG21RYQUCcDr4XWZEFCrurLa8cdA";`
- **Severity:** 🔴 **CRITICAL**
- **Impact:** Anyone with the extension CRX/ZIP can extract this token and impersonate the bot, read all chat history, send messages to the group, or delete the bot. The token grants full Bot API access.
- **Mitigation:** Move token to an environment variable at build time, or proxy Telegram calls through the license server (`shift-grabber.vercel.app`) so the token never ships to clients.

### 1.2 Telegram Chat ID — HIGH
- **File:** `service-worker.js`  
- **Line:** `5`  
- **Finding:** `const TG_CHAT_ID = "-1003719428092";`
- **Severity:** 🟠 **HIGH**
- **Impact:** Exposes the target group/channel. Combined with the leaked token, an attacker can spam the channel or enumerate members if privacy settings are weak.
- **Mitigation:** Same as above — proxy through backend.

### 1.3 License Server URL — MEDIUM
- **File:** `popup.js`  
- **Line:** `39` (`const SERVER = "https://shift-grabber.vercel.app";`)  
- **File:** `service-worker.js`  
- **Line:** `302` (`fetch("https://shift-grabber.vercel.app/verify" ...)`)
- **Severity:** 🟡 **MEDIUM**
- **Impact:** An attacker who compromises the Vercel deployment or seizes the domain can push malicious verification responses, revoke tokens, or harvest `deviceId` + `key` pairs.
- **Mitigation:** Pin the server certificate or public key; validate response signatures if available.

### 1.4 Employee ID Extraction & Relay
- **File:** `api-layer.js`  
- **Lines:** `49-54`  
- **Finding:** Scrapes `localStorage` for keys matching `/aza-user-features-(\d+)-prod/` and extracts the numeric employee ID.
- **File:** `main.js`  
- **Lines:** `495-498`  
- **Finding:** Receives EID via postMessage and stores it in `chrome.storage.local` as `sg_eid`, then relays to service worker.
- **Severity:** 🟡 **MEDIUM**
- **Impact:** Employee ID is persisted in extension storage and sent to the license server during verification (indirectly, as part of normal operation). No encryption at rest.
- **Mitigation:** Do not persist EID longer than necessary; clear after session ends.

## 2. Permission Attack Surface

### Manifest Permissions (`manifest.json:6`)

| Permission | Capability | Abuse Scenario |
|------------|-----------|----------------|
| `tabs` | Query, reload, inject into any tab | Malicious popup/script could enumerate browsing history or inject into banking sites (mitigated by `host_permissions`) |
| `storage` | Read/write unlimited local data | Could be used to store exfiltrated data; no quota limit checked |
| `scripting` | Execute scripts in matched pages | **Most dangerous.** Combined with broad host permissions, allows arbitrary code execution on Amazon domains |
| `alarms` | Register periodic wake events | Could be abused for persistent background activity even when "disabled" |

### Host Permissions (`manifest.json:7-12`)

```json
"host_permissions": [
  "https://atoz.amazon.work/*",
  "https://atoz-apps.amazon.work/*",
  "https://shift-grabber.vercel.app/*",
  "https://api.telegram.org/*"
]
```

| Risk | Assessment |
|------|------------|
| **Amazon domains** | Justified — core functionality. However, `scripting` + Amazon hosts = ability to manipulate internal HR systems. |
| **License server** | Justified — but no CSP or certificate pinning. |
| **Telegram API** | Justified for direct push, but see Secrets Exposure. |
| **Missing** | No `activeTab` or `debugger` permissions, which limits some attack vectors. |

## 3. CSRF Protection

- **File:** `api-layer.js`  
- **Lines:** `33-43` (`getCsrf`)  
- **Mechanism:** Reads `anti-csrftoken-a2z` from:
  1. `document.cookie` matching `anti-csrftoken-a2z=([^;]+)` (line 37)
  2. `<meta name="anti-csrftoken-a2z">` element (line 39)
- **Caching:** Caches token for 60 seconds (`csrfTs`) to avoid repeated cookie reads (line 35).
- **Header injection:** Injects `anti-csrftoken-a2z` header on every fetch (line 69).
- **Assessment:** ✅ **Correct.** The extension reuses the host page's CSRF token, which is the only valid way to make authenticated requests from the MAIN world. Caching reduces fingerprinting but could theoretically use a stale token if Amazon rotates mid-minute. No custom CSRF logic is added.

## 4. Rate Limiting Safety

- **File:** `api-layer.js`  
- **Lines:** `149-164` (`handleRateLimit`)  
- **Detection:** Checks HTTP 429 status on poll response (line 199).
- **Backoff:** Increases `pollInterval` from `1000ms` → `5000ms` for 30 seconds (line 155, 157).
- **Recovery:** After 30s timer, resets `pollInterval` to `baseInterval` and clears error count (lines 158-161).
- **Jitter:** Poll loop adds ±200ms jitter (line 242) to avoid fixed-cadence detection.
- **Assessment:** ✅ **Adequate for basic evasion.** However, there is **no exponential backoff** — only a fixed 5s/30s window. A sustained 429 storm could still trigger harder blocks. The 30s timer is not adaptive.

## 5. Input Validation Gaps

| Input | Location | Validation | Gap |
|-------|----------|------------|-----|
| License key | `popup.js:193` | `.trim()` only | No length/format check; arbitrary strings sent to server |
| Blacklist dates | `popup.js:242` | `if (!v) return` | No ISO date format validation; malformed dates silently ignored by `api-layer.js` |
| Date picker | `popup.js:218` | `if (!v) return` | No range validation |
| `msg.type` | `main.js:421` | `if (!msg \|\| !msg.type) return` | No whitelist — any type string is evaluated; fortunately only `if` blocks match |
| `e.data.type` | `main.js:491` | `if (e.source !== window \|\| !e.data?.sg) return` | ✅ Origin check on source; `sg` flag required |
| `e.data.type` | `api-layer.js:255` | Same pattern | ✅ Same origin check |

**Finding:** `service-worker.js` message handler (`handleMessage`, line 198) does **not** validate `sender` origin. Any extension page or content script can send messages like `SG_SET_ENABLED` or `SG_RELOAD_ALL_NOW`. In MV3 this is mostly mitigated by same-extension origin, but compromised content could manipulate state.

## 6. MITM / Transport Security

| Endpoint | Protocol | Risk |
|----------|----------|------|
| Amazon GQL (`atoz-apps.amazon.work`) | HTTPS | ✅ Enterprise-grade TLS |
| License server (`shift-grabber.vercel.app`) | HTTPS | ✅ Vercel-managed TLS; no pinning |
| Telegram API (`api.telegram.org`) | HTTPS | ✅ Telegram standard API |

**Finding:** No custom certificate pinning or HPKP. A compromised CA or rogue WiFi could MITM the license verification or Telegram push. Given the hardcoded token, MITM on Telegram is less relevant (attacker already has token). MITM on license server could inject `authorized: true` responses.

## 7. Privacy Concerns

| Data | Collected By | Sent To | Retention |
|------|-------------|---------|-----------|
| Employee ID (numeric) | `api-layer.js` (localStorage scrape) | `service-worker.js` (local storage) | Indefinite (`sg_eid`) |
| License key | `popup.js` | `shift-grabber.vercel.app` | Indefinite (`SG_userKey`) |
| Device UUID | `popup.js` (`crypto.randomUUID`) | `shift-grabber.vercel.app` | Indefinite (`SG_deviceId`) |
| Shift grab timestamps | `main.js` | Telegram group (via queue) | Ephemeral queue; persistent in Telegram chat |
| User-selected dates | `popup.js` | `chrome.storage.local` only | Indefinite (`sg_dates`) |
| Page URL date param | `main.js` | Nowhere (local use only) | Runtime only |

**Assessment:** The extension collects **PII** (employee ID) and **telemetry** (shift grab events) without disclosed consent mechanism. The Telegram queue sends user activity to a third-party service with no opt-out.

## 8. Security Score by Component (1–5, 5 = Best)

| Component | Score | Justification |
|-----------|-------|---------------|
| `api-layer.js` | 4 | Good CSRF reuse and jitter, but employee ID scraping is invasive; no input sanitization on GraphQL responses. **Stealth engine added**: Poisson polling, reaction delay, query rotation, decoy interactions |
| `main.js` | 3 | WeakSet prevents duplicate clicks (good), but keyboard shortcuts have no modifier lockout (P/R/T hijack risk); Telegram queue leaks activity |
| `service-worker.js` | 4 | **Secrets removed** (Telegram credentials now fail closed); sender validation added; **circuit breaker** added; **HMAC response validation** added; **encrypted token storage** added; **integrity checks** added; **device fingerprinting** added |
| `popup.js` | 3 | Subscription UI added; license key still stored plaintext (UI convenience); verify button has no rate limiting |
| `manifest.json` | 3 | Permissions justified; no CSP defined |
| `Build pipeline` | 4 | Obfuscation script with control-flow flattening, string encoding, dead code injection, debug protection |

## 9. Anti-Reverse-Engineering Measures (v2.1.0+)

| Measure | Status | Effectiveness |
|---------|--------|---------------|
| Build-time obfuscation | ✅ Implemented | High — stops casual copying |
| Response HMAC signing | ✅ Client-side implemented | High — stops MITM and fake tokens |
| Token encryption at rest | ✅ Implemented | Medium — stops DevTools bypass |
| Device fingerprinting | ✅ Implemented | Medium — detects key sharing |
| Self-integrity checks | ✅ Implemented | Medium — detects patching |
| Circuit breaker | ✅ Implemented | Medium — graceful degradation |
| Rate limiting | ⏳ Server-side only | High — stops brute force |
| Request signing | ⏳ Server-side only | Medium — stops replays |
| Claim-report blacklisting | ⏳ Server-side only | Medium — remote kill switch |
| Watermarking | ⏳ Not implemented | Low — post-incident tracing |

## 10. Known Limitations

**Chrome extensions cannot be made uncrackable.** A determined attacker with sufficient skill can always:
1. Unpack the CRX (it's a ZIP file)
2. Read the obfuscated JavaScript
3. Patch license checks or remove them entirely
4. Fork and redistribute

**What we CAN do:**
- Raise the bar so cracking takes 8+ hours of skilled reverse engineering
- Make the cracked version less valuable (no config updates, no server-side features)
- Detect and blacklist compromised licenses via claim reporting
- Use legal/business pressure (DMCA, ToS enforcement)

**The strongest protection is continuous value delivery:** legitimate users get stealth updates, priority support, and community access that cracked versions cannot replicate.

## References

- [[main.js]] — DOM backup and HUD
- [[api-layer.js]] — GraphQL polling and CSRF handling
- [[service-worker.js]] — Background scheduling and secret exposure
- [[license.js]] — License verification helper
- [[License & Token Lifecycle]] — Token refresh trust boundary
- [[Architecture Map]] — Component trust zones
- [[Configuration Reference]] — Security-relevant constants
- [[Technical Debt Register]] — Prioritised security debt
- [[External API Contracts]] — Transport and auth contracts
- [[Project Evolution]] — Security posture across versions
- [[Shift Grabber V9 Index]]
- [[Master Document]]
