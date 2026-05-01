# Performance Characteristics

Measured and theoretical performance profile of [[Shift Grabber V9 Index|Shift Grabber V9]].

---

## Detect-to-Claim Latency

| Path | Typical | Best | Worst | Notes |
|------|---------|------|-------|-------|
| **API polling → claim** | ~220 ms | ~120 ms | ~500 ms + backoff | 1 s poll interval + network + 3 staggered attempts |
| **DOM backup → claim** | ~800 ms | ~400 ms | ~2 s + confirm wait | 800 ms scan interval + click stagger + 120 ms confirm wait |
| **Burst reload → DOM** | ~1.5 s | ~1 s | ~3 s | Page reload + render + DOM scan |

**API path is ~3.6× faster than DOM backup** under normal conditions.

---

## Polling Load

### Per Tab (Normal Mode)

| Metric | Value |
|--------|-------|
| Poll interval | 1000 ms ± 200 ms jitter |
| GraphQL request size | ~400 bytes |
| GraphQL response size | ~2–50 KB (depends on shift availability) |
| Requests per hour | ~3,600 |
| Bandwidth per hour | ~1.4–180 MB |

### Per Tab (Turbo Mode)

| Metric | Value |
|--------|-------|
| Poll interval | 500 ms ± 200 ms jitter |
| Requests per hour | ~7,200 |
| Bandwidth per hour | ~2.8–360 MB |

### With 7-Day Window

A single tab covers 7 days. Without this optimisation, a user would need:
- 7 tabs open (one per day)
- 7× the polling load
- 7× the bandwidth
- 7× the memory

**7-day window reduces resource usage by ~85%** vs one-tab-per-date strategies.

---

## Burst Scheduling Load

| Metric | Value |
|--------|-------|
| Burst anchor frequency | Every 5 minutes |
| Reloads per burst | 2 |
| Inter-reload delay | 4000 ms ± 250 ms jitter |
| Tab reloads per hour | ~24 |
| Override mode reloads | Every ~4 seconds |
| Override reloads per hour | ~900 |

Burst reloads are cheap (browser cache hits for static assets) but DOM state is lost.

---

## Memory Footprint

| Component | Estimate |
|-----------|----------|
| `main.js` (ISOLATED) | ~50 KB heap |
| `api-layer.js` (MAIN) | ~30 KB heap |
| Service worker | ~20 KB (ephemeral) |
| Popup | ~10 KB (ephemeral) |
| Storage | < 15 KB |
| **Total per tab** | **~80 KB** |

Negligible compared to modern web pages (Amazon AtoZ itself uses 50–100 MB).

---

## Rate Limit Behaviour

When Amazon returns HTTP 429:

| Phase | Duration | Poll Interval | Recovery Action |
|-------|----------|---------------|-----------------|
| Normal | indefinite | 1000 ms | — |
| Backoff | 30 s | 5000 ms | Auto-detects 429, backs off |
| Recovery | immediate | 1000 ms | Timer expires, resumes normal |

No exponential escalation. Fixed 5 s / 30 s recovery.

---

## CPU Usage

| Activity | CPU Impact |
|----------|------------|
| GraphQL poll | Negligible (single fetch) |
| DOM scan (backup) | Low (`querySelectorAll` every 800 ms) |
| HUD update | Very low (DOM innerHTML every 500 ms) |
| Alarm wake | Negligible (SW wakes, checks state, sleeps) |
| Tab reload | Medium (full page re-render) |

Overall: Extension is **I/O-bound**, not CPU-bound. Polling is network-limited.

---

## Scaling Limits

| Resource | Practical Limit | Bottleneck |
|----------|-----------------|------------|
| Open AtoZ tabs | 10–20 | Browser memory (Amazon page is heavy) |
| Poll frequency | 300 ms (clamped) | Amazon rate limiting |
| Telegram queue | Unbounded (theoretically) | Storage quota (5 MB) |
| Concurrent claims | 1 per tab | Sequential `pollOnce()` design |

---

## Competitor Comparison

| Feature | Shift Grabber V9 | DOM-Only Tools | API-Only Tools |
|---------|------------------|----------------|----------------|
| Detect-to-claim | ~220 ms | ~800 ms | ~220 ms |
| Date coverage per tab | 7 days | 1 day | Varies |
| Works without API | Yes (DOM backup) | Yes | No |
| Rate limit recovery | Yes (30 s backoff) | Usually no | Varies |
| Background scheduling | Yes (alarms) | No (requires open popup) | Varies |
| Tab count for full week | 1 | 7 | Varies |

---

## Related

- [[api-layer.js]] — Polling implementation
- [[main.js]] — DOM backup implementation
- [[service-worker.js]] — Burst scheduling
- [[Configuration Reference]] — Tunable timing values
- [[Technical Debt Register]] — Rate limit recovery limitations
- [[MV3 Platform Constraints]] — Why alarms are used instead of timers
