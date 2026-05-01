# Assets & Resources

Non-code runtime artifacts shipped with [[Shift Grabber V9 Index|Shift Grabber V9]].

---

## Icons

| File | Size | Usage |
|------|------|-------|
| `icons/icon16.png` | 16×16 px | Browser toolbar icon |
| `icons/icon48.png` | 48×48 px | Extension management page (`chrome://extensions/`) |
| `icons/icon128.png` | 128×128 px | Chrome Web Store listing |

All icons are standard PNGs with alpha transparency. No SVG versions exist.

> **Debt:** No dark-mode variant of icons. The current icons may have poor contrast on dark browser themes. See [[Technical Debt Register]].

---

## Sounds

| File | Format | Size | Usage |
|------|--------|------|-------|
| `sounds/click.mp3` | MPEG-1 Audio Layer III | ~5 KB | Alert played when a shift is successfully claimed |

### How It's Played

```javascript
// main.js, lines 105–113
function playAlert() {
  const audio = new Audio();
  audio.src = chrome.runtime.getURL("sounds/click.mp3");
  audio.play().catch(() => {});
}
```

**Why web-accessible:** The `<audio>` element is created in the MAIN world context (inherited from page scripts), so the asset must be declared in `web_accessible_resources` in [[manifest.json]]:

```json
"web_accessible_resources": [
  { "resources": ["sounds/click.mp3"], "matches": ["https://atoz.amazon.work/*"] }
]
```

### Sound Characteristics

- Short, sharp click — designed to be attention-grabbing without being annoying
- No volume control in extension settings
- No mute toggle (other than disabling the extension or system volume)

---

## Web-Accessible Resources

Only one resource is exposed to the page context:

| Resource | Matches | Risk Level |
|----------|---------|------------|
| `sounds/click.mp3` | `https://atoz.amazon.work/*` | Low — read-only media file |

No other extension internals (scripts, storage, keys) are web-accessible.

---

## Asset Maintenance

### Updating Icons

1. Export new PNGs at exactly 16×16, 48×48, and 128×128
2. Overwrite files in `icons/`
3. Reload extension in `chrome://extensions/`
4. Clear browser cache if toolbar icon doesn't update immediately

### Updating Alert Sound

1. Replace `sounds/click.mp3` (keep filename or update `main.js` reference)
2. Keep file size small (< 20 KB) to avoid extension bloat
3. Test on AtoZ page — some browsers block autoplay until user interaction

---

## Related

- [[manifest.json]] — Where `web_accessible_resources` is declared
- [[main.js]] — Where `playAlert()` is defined
- [[Popup UI]] — Visual design system (colours, typography)
- [[Development & Deployment]] — How to reload after asset changes
