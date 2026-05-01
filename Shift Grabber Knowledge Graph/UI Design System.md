# UI Design System

Premium visual design system for Shift Grabber V9 commercial version.

## Philosophy

High-end dark theme inspired by modern SaaS dashboards (Linear, Vercel, Raycast):
- **Glassmorphism** cards with backdrop blur
- **Indigo/violet** gradient accent system
- **Monospace** fonts for data, clean sans-serif for UI
- **Micro-interactions** on every interactive element
- **Accessibility-first** with focus rings and reduced-motion support

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#08090d` | Deepest background |
| `--bg-base` | `#0a0b0f` | Body background |
| `--bg-surface` | `rgba(16,17,24,0.85)` | Card backgrounds |
| `--bg-elevated` | `rgba(24,25,34,0.92)` | Elevated surfaces |
| `--accent-500` | `#6366f1` | Primary indigo |
| `--violet-500` | `#8b5cf6` | Secondary violet |
| `--success` | `#22c55e` | Success states |
| `--warning` | `#f59e0b` | Warning states |
| `--error` | `#ef4444` | Error states |

## Typography

- **UI font:** `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`
- **Data/mono:** `"JetBrains Mono", "Fira Code", ui-monospace`
- **Scale:** 9px labels → 13px body → 15px headers → 38px timer display

## Animation Tokens

| Name | Curve | Usage |
|------|-------|-------|
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Card entrances, modals |
| `--ease-out-back` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Toggle switches |
| `--ease-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | Hover states |

## Components

### Cards
- Backdrop blur: `blur(20px)`
- Border: `1px solid rgba(255,255,255,0.08)`
- Shadow: `0 4px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03)`
- Entrance: fade up + slight scale

### Buttons
- Primary: `linear-gradient(135deg, #6366f1, #8b5cf6)`
- Hover: translateY(-2px) + expanded shadow
- Active: translateY(0) + contracted shadow
- Ghost: transparent with border, hover shows tinted background

### Status Badges
- Pulsing dot with colored glow
- Uppercase, wide tracking
- Border matches text color at reduced opacity

### Inputs
- Dark background with subtle border
- Focus: accent color border + 3px glow ring
- Hover: slightly brighter border

### HUD (In-Page)
- Glassmorphism with backdrop blur
- Monospace timer display
- Gradient badges
- Smooth entrance animation

## Accessibility

- `prefers-reduced-motion` disables all animations
- `:focus-visible` outlines with accent color
- ARIA labels on all interactive elements
- Color contrast ratios meet WCAG AA

## Files

- `popup/styles.css` — Complete design system
- `popup/popup.js` — Class-based state management (no inline styles)
- `src/content/main.js` — HUD styles injected via `<style>` tag

## Related

- [[Shift Grabber V9 Index]]
- [[Commercial Architecture]]
- [[Popup UI]]
