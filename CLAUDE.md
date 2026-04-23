# CLAUDE.md

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

## File Organization

- Use `/src` for source code files
- Use `/background` for service worker / background scripts
- Use `/popup` for popup UI files
- Use `/icons` for icon assets

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- ALWAYS batch ALL todos in ONE TodoWrite call (5-10+ minimum)
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL terminal operations in ONE Bash message

## Available Skills

### Caveman (token compression)
- `/caveman` — full caveman mode (drop articles, filler, hedging; fragments OK)
- `/caveman lite` — professional but tight (no filler, keep sentences)
- `/caveman ultra` — extreme compression (abbreviate everything)
- `/caveman-commit` — terse Conventional Commits messages
- `/caveman-review` — one-line PR comments: `L42: 🔴 bug: problem. fix.`
- `/caveman:compress <file>` — compress .md files to save ~46% input tokens
- `/caveman-help` — show all caveman commands
- "stop caveman" / "normal mode" — deactivate

### Ruflo (multi-agent orchestration)
Skills available for complex multi-agent workflows:
- `swarm-orchestration`, `swarm-advanced` — coordinate agent swarms
- `sparc-methodology` — SPARC workflow execution
- `github-*` — GitHub workflow automation
- `performance-analysis`, `v3-performance-optimization` — perf profiling
- `v3-security-overhaul` — security auditing
- `agentdb-*`, `reasoningbank-*` — memory and intelligence patterns
- `hive-mind-advanced` — Byzantine fault-tolerant consensus
- `pair-programming`, `skill-builder`, `dual-mode` — dev workflows

Invoke with `/[skill-name]` or describe the task.

## Swarm: When to Auto-Invoke

**Use swarm for:** multi-file changes (3+), new feature implementation, refactoring across modules, security audits, performance optimization.

**Skip swarm for:** single-file edits, simple bug fixes (1-2 lines), docs updates, config changes, quick questions.
