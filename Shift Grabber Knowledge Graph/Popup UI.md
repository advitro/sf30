# Popup UI

The visual control surface of [[Shift Grabber V9 Index|Shift Grabber V9]]. Built as a static HTML/CSS panel with no framework dependencies, keeping the bundle minimal and cold-start instantaneous.

---

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `popup/index.html` | DOM structure | 87 |
| `popup/styles.css` | Theme + layout | 269 |
| `popup/popup.js` | Logic & events | See [[popup.js]] |

---

## Visual Architecture

### Design System

```css
:root {
  --bg:     #16171f;   /* Deep space background */
  --card:   #1e1f28;   /* Elevated surface */
  --border: #2c2d3a;   /* Subtle dividers */
  --fg:     #dde1f0;   /* Primary text */
  --muted:  #6b6e85;   /* Secondary text */
  --green:  #4ade80;   /* LIVE / success */
  --red:    #f87171;   /* PAUSED / error */
  --blue:   #60a5fa;   /* Interactive / accent */
  --orange: #fbbf24;   /* FAST / warning */
}
```

The palette is **dark-mode native** with high-contrast semantic colours. No light-mode variant exists.

### Layout Sections (in order)

1. **Header** — Brand mark `SG · V9` + dynamic [[Popup UI#Status Badge|status badge]]
2. **Enable Card** — Toggle switch with description
3. **Open Date Tabs** — Date picker + pill list + bulk-open action
4. **Blacklist Dates** — Date picker + pill list + apply action
5. **Keyboard Shortcuts** — Four quick-action buttons (Pause, Override, HUD, Reload)
6. **License** — Key input + verify button + status text
7. **Contact** — External link CTA
8. **Footer** — `Shift Grabber V9 · All tabs sync`

### Status Badge

Four states rendered as a pill in the header:

| State | Class | Colour | Meaning |
|-------|-------|--------|---------|
| OFF | `.badge.off` | `var(--muted)` | Extension disabled |
| LIVE | `.badge.live` | `var(--green)` | Polling active |
| PAUSED | `.badge.paused` | `var(--red)` | User paused |
| FAST | `.badge.fast` | `var(--orange)` | Turbo mode (500 ms) |

The badge state is driven by `updateStatusBadge()` in [[popup.js]].

---

## Component Details

### Toggle Switch

Custom CSS-only checkbox styled as a sliding pill:
- Width 44 px, height 24 px
- Knob transitions 0.25 s with `translateX(20px)`
- Checked state switches background to `#1d3557` with blue border

### Date Pills

Dynamic `<span class="date-pill">` elements injected by `popup.js`:
- Background `#1e2840`, text `#93b4f0`
- Each pill contains a remove button (×)
- Lists render `.empty` text when no items present

### Buttons

Three variants:
- **Primary** (`btn`) — blue background, dark text
- **Ghost** (`btn.ghost`) — transparent, bordered, muted text; hover → blue border + text
- **Layout** (`btn.half`, `btn.full`) — width distribution

---

## CSS Architecture

No preprocessor, no utility framework. Organised by section with comment dividers:

1. CSS variables (`:root`)
2. Reset + base (`body`)
3. Layout wrapper (`.wrap`)
4. Header + badge
5. Card container
6. Toggle row
7. Input row
8. Dates list + pills
9. Buttons + actions
10. Status text + helpers
11. Toggle switch mechanics
12. Footer

**Key CSS decisions:**
- `min-width: 310px` on `body` prevents panel collapse
- `-webkit-font-smoothing: antialiased` for crisp text on macOS
- `flex: 1` on inputs lets them shrink inside flex rows
- `min-width: 0` required for proper `flex: 1` truncation in Chrome

---

## Accessibility Notes

- No `aria-label` attributes on interactive elements
- Colour-only state communication (badge lacks text description for screen readers)
- Input placeholders used instead of visible `<label>` elements
- Keyboard navigation works natively because all controls are standard HTML elements

> **Debt:** Accessibility audit needed. See [[Technical Debt Register]].

---

## Related

- [[popup.js]] — Event wiring and state management
- [[Components Index]] — All UI and logic modules
- [[Configuration Reference]] — Tunable values that affect popup behaviour
- [[License & Token Lifecycle]] — How the license section works end-to-end
