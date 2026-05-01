# Graph View

This note is designed to be read alongside **Obsidian's native Graph View** (`Ctrl/Cmd + G`). It explains the visual clusters, color coding, and curated pathways through the Shift Grabber V9 knowledge graph.

## What Each Cluster Represents

The vault graph naturally separates into five clusters:

1. **Source Files (Blue)** — The nine runtime artifacts: [[manifest.json]], [[main.js]], [[api-layer.js]], [[service-worker.js]], [[popup.js]], [[Popup UI]], [[license.js]], [[Assets & Resources]], and [[Development & Deployment]]. These are the leaf nodes containing the actual implementation details.
2. **Architecture Notes (Green)** — System-structure documents: [[Architecture Map]], [[Dependency Graph]], and [[Module Analysis]]. These nodes have dense outbound edges to every source file.
3. **Security & Flow Notes (Red)** — Runtime-behavior and risk documentation: [[Data Flow]], [[Security Audit]], and [[License & Token Lifecycle]]. These bridge source files with operational concerns.
4. **Index Notes (Yellow)** — The four aggregator pages: [[Shift Grabber V9 Index]], [[Components Index]], [[Flows Index]], and this note. They sit at the center of the graph with high connectivity.
5. **Reference Notes (Purple)** — Registers, contracts, trackers, workflow docs, and deep-dives: [[Master Document]], [[Configuration Reference]], [[External API Contracts]], [[Technical Debt Register]], [[Project Evolution]], [[Development & Deployment]], [[Assets & Resources]], [[Message Router & State Bus]], [[State & Storage Model]], [[MV3 Platform Constraints]], [[Performance Characteristics]], [[Error Handling & Resilience]], and [[Work Log]]. These provide canonical facts that many other notes cite.

## Color-Coding Legend

| Color | Meaning | Notes |
|-------|---------|-------|
| 🔵 Blue | **Source files (code)** | [[manifest.json]], [[main.js]], [[api-layer.js]], [[service-worker.js]], [[popup.js]], [[Popup UI]], [[license.js]] |
| 🟢 Green | **Architecture notes** | [[Architecture Map]], [[Dependency Graph]], [[Module Analysis]] |
| 🔴 Red | **Security / Flow notes** | [[Data Flow]], [[Security Audit]], [[License & Token Lifecycle]] |
| 🟡 Yellow | **Index / Navigation notes** | [[Shift Grabber V9 Index]], [[Components Index]], [[Flows Index]], [[Graph View]] |
| 🟣 Purple | **Reference / Canonical notes** | [[Master Document]], [[Configuration Reference]], [[External API Contracts]], [[Technical Debt Register]], [[Project Evolution]], [[Development & Deployment]], [[Assets & Resources]], [[Message Router & State Bus]], [[State & Storage Model]], [[Work Log]] |

> In Obsidian's Graph View, apply **Groups** by path or tag to recreate these colors automatically.

## Pathways Through the Graph

Choose a trail based on your role:

### New Developer
**Goal**: Understand the codebase and make a first change.

1. Start at [[Shift Grabber V9 Index]] for the vault overview.
2. Read [[Architecture Map]] to learn module boundaries.
3. Open [[main.js]] to see the content-script entry point.
4. Dive into [[api-layer.js]] for the core claiming logic.

*Optional detour*: [[Components Index]] → [[popup.js]] → [[Popup UI]] if your first task is UI-related.

### Security Reviewer
**Goal**: Audit secrets, permissions, and transport safety.

1. Start at [[Shift Grabber V9 Index]].
2. Read [[Security Audit]] for the consolidated risk register.
3. Trace token handling in [[License & Token Lifecycle]].
4. Verify background enforcement in [[service-worker.js]].

*Optional detour*: [[Security Audit]] → [[manifest.json]] to validate declared permissions, or [[Technical Debt Register]] to see what's already known.

### DevOps / Infrastructure
**Goal**: Understand deployment, alarms, and external dependencies.

1. Start at [[Shift Grabber V9 Index]].
2. Review [[Dependency Graph]] for external API surface area.
3. Follow [[Data Flow]] to map message paths and storage boundaries.
4. Inspect [[service-worker.js]] for alarm cadence and token refresh logic.

*Optional detour*: [[Data Flow]] → [[api-layer.js]] to understand GraphQL polling load, or [[External API Contracts]] for request schemas.

## Embedding Tips

- **Local Graph**: Open the local graph pane on any note to see only its immediate neighbors. This removes noise when deep-diving into a single component.
- **Filters**: In global Graph View, use the search/filter box to isolate a single cluster (e.g., type `tag:#security` or `path:Flow`).
- **Mermaid Fallback**: If you need a static reference, the Mermaid diagram embedded in [[Shift Grabber V9 Index]] renders independently of Obsidian's graph engine.
- **Backlinks**: Every note in this vault is reachable via forward links from an index note. Use Obsidian's **Backlinks** panel to confirm nothing is orphaned.

## Related Notes

- [[Shift Grabber V9 Index]]
- [[Components Index]]
- [[Flows Index]]
- [[Architecture Map]]
- [[Dependency Graph]]
- [[Data Flow]]
- [[Security Audit]]
- [[Assets & Resources]]
- [[Development & Deployment]]
- [[Master Document]]
- [[Technical Debt Register]]
- [[Configuration Reference]]
- [[External API Contracts]]
- [[Project Evolution]]
