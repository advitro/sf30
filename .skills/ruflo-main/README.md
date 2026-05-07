<div align="center">

![Ruflo Banner](ruflo/assets/ruflo-small.jpeg)

[![Star on GitHub](https://img.shields.io/github/stars/ruvnet/claude-flow?style=for-the-badge&logo=github&color=gold)](https://github.com/ruvnet/claude-flow)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-green?style=for-the-badge&logo=anthropic)](https://github.com/ruvnet/claude-flow)

# Ruflo

**Multi-agent AI orchestration for Claude Code**

</div>

Orchestrate 100+ specialized AI agents across machines, teams, and trust boundaries. Ruflo adds coordinated swarms, self-learning memory, federated comms, and enterprise security to Claude Code — so agents don't just run, they collaborate.

### Why Ruflo?

> Claude Flow is now Ruflo — named by Ruv, who loves Rust, flow states, and building things that feel inevitable. The "Ru" is the Ruv. The "flo" is the flow. Underneath, WASM kernels written in Rust power the policy engine, embeddings, and proof system. 

### What Ruflo Does

One `init` gives Claude Code a nervous system: agents self-organize into swarms, learn from every task, remember across sessions, and — with federation — securely talk to agents on other machines without leaking data. You keep writing code. Ruflo handles the coordination.

```
Self-Learning / Self-Optimizing Agent Architecture

User --> Ruflo (CLI/MCP) --> Router --> Swarm --> Agents --> Memory --> LLM Providers
                          ^                           |
                          +---- Learning Loop <-------+
```

> **New to Ruflo?** You don't need to learn 314 MCP tools or 26 CLI commands. After `init`, just use Claude Code normally -- the hooks system automatically routes tasks, learns from successful patterns, and coordinates agents in the background.

---

## Quick Start

### Claude Code Plugin (Recommended)

Install Ruflo as a native Claude Code plugin -- adds skills, commands, agents, and MCP tools directly:

```bash
# Add the marketplace
/plugin marketplace add ruvnet/ruflo

# Install core + any plugins you need
/plugin install ruflo-core@ruflo
/plugin install ruflo-swarm@ruflo
/plugin install ruflo-autopilot@ruflo
/plugin install ruflo-federation@ruflo
```

<details>
<summary><strong>All 32 plugins</strong></summary>

| Plugin | What it adds |
|--------|-------------|
| **ruflo-core** | MCP server, `/status`, `/doctor`, plugin discovery, base agents |
| **ruflo-swarm** | Swarm coordination, Monitor streams, worktree isolation |
| **ruflo-autopilot** | Autonomous `/loop` completion with learning and prediction |
| **ruflo-loop-workers** | Background `/loop` workers, CronCreate scheduling |
| **ruflo-workflows** | Workflow templates, orchestration, lifecycle management |
| **ruflo-agentdb** | AgentDB controllers, HNSW vector search, RuVector embeddings |
| **ruflo-rag-memory** | SOTA RAG — hybrid search (RRF), Graph RAG multi-hop, MMR diversity |
| **ruflo-rvf** | RVF portable memory, session persistence, transfer |
| **ruflo-ruvector** | [`ruvector`](https://npmjs.com/package/ruvector) — FlashAttention-3, Graph RAG, 103 MCP tools, Brain AGI |
| **ruflo-knowledge-graph** | Entity extraction, relation mapping, pathfinder traversal |
| **ruflo-intelligence** | Self-learning SONA patterns, trajectory learning, model routing |
| **ruflo-daa** | Dynamic Agentic Architecture, cognitive patterns |
| **ruflo-adr** | ADR lifecycle — create, index, supersede, compliance checking |
| **ruflo-ddd** | DDD scaffolding — bounded contexts, aggregates, domain events |
| **ruflo-sparc** | SPARC methodology with 5 phases and quality gates |
| **ruflo-security-audit** | Security scanning, CVE checks, dependency audit |
| **ruflo-aidefence** | AI safety scanning, PII detection, prompt injection defense |
| **ruflo-testgen** | Test gap detection, TDD workflow, tester agent |
| **ruflo-browser** | Playwright browser automation for testing and scraping |
| **ruflo-jujutsu** | Git diff analysis, risk scoring, reviewer recommendations |
| **ruflo-docs** | Doc generation, drift detection, docs-writer agent |
| **ruflo-ruvllm** | Local LLM inference, MicroLoRA, multi-provider chat |
| **ruflo-wasm** | Sandboxed WASM agent creation and gallery sharing |
| **ruflo-plugin-creator** | Scaffold, validate, and publish new plugins |
| **ruflo-migrations** | Database schema migration management |
| **ruflo-observability** | Structured logging, tracing, metrics correlation |
| **ruflo-cost-tracker** | Token usage tracking, budget alerts, cost optimization |
| **ruflo-goals** | GOAP planning, deep research, long-horizon tracking |
| **ruflo-federation** | Zero-trust agent federation, PII pipeline, cross-installation comms |
| **ruflo-iot-cognitum** | Cognitum Seed IoT — trust scoring, anomaly detection, fleet management |
| **ruflo-neural-trader** | [`neural-trader`](https://npmjs.com/package/neural-trader) — 4 agents, Rust/NAPI backtesting, 112+ MCP tools |
| **ruflo-market-data** | Market data ingestion, OHLCV vectorization, pattern matching |

</details>

### CLI Install

```bash
# One-line install
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/ruflo@main/scripts/install.sh | bash

# Or via npx
npx ruflo@latest init --wizard

# Or install globally
npm install -g ruflo@latest
```

### MCP Server

```bash
# Add Ruflo as an MCP server in Claude Code
claude mcp add ruflo -- npx -y @claude-flow/cli@latest
```

---

## What You Get

| Capability | Description |
|------------|-------------|
| 🤖 **100+ Agents** | Specialized agents for coding, testing, security, docs, architecture |
| 📡 **Comms Layer** | Zero-trust federation — agents across machines/orgs discover, authenticate, and exchange work securely |
| 🐝 **Swarm Coordination** | Hierarchical, mesh, and adaptive topologies with consensus |
| 🧠 **Self-Learning** | SONA neural patterns, ReasoningBank, trajectory learning |
| 💾 **Vector Memory** | HNSW-indexed AgentDB with 150x-12,500x faster search |
| ⚡ **Background Workers** | 12 auto-triggered workers (audit, optimize, testgaps, etc.) |
| 🧩 **Plugin Marketplace** | 32 native Claude Code plugins + 21 npm plugins |
| 🔌 **Multi-Provider** | Claude, GPT, Gemini, Cohere, Ollama with smart routing |
| 🛡️ **Security** | AIDefence, input validation, CVE remediation, path traversal prevention |
| 🌐 **Agent Federation** | Cross-installation agent collaboration with zero-trust security 

### Agent Federation — Slack for Agents

```
Your Agent --> [ Remove secrets ] --> [ Sign message ] --> [ Encrypted channel ]
                 Emails, SSNs,        Proves it came       No one reads it
                 keys stripped         from you              in transit
                                                                |
                                                                v
Their Agent <-- [ Block attacks ] <-- [ Check identity ] <------+
                 Stops prompt          Rejects forgeries
                 injection

                          Audit trail on both sides.
                  Trust builds over time. Bad behavior = instant downgrade.
```

Slack gave teams channels. Federation gives agents the same thing — **shared workspaces across trust boundaries**, where agents on different machines, orgs, or cloud regions can discover each other, prove who they are, and collaborate on tasks.

The difference: some channels are trusted, some aren't. [`@claude-flow/plugin-agent-federation`](https://github.com/ruvnet/ruflo/issues/1669) handles that automatically. Your agents join a federation, get verified via mTLS + ed25519, and start exchanging work — with PII stripped before anything leaves your node and every message auditable. Untrusted agents can still participate at lower privilege: they see discovery info, not your memory. As they prove reliable, trust upgrades. If they misbehave, they get downgraded instantly — no human in the loop required.

You don't configure handshakes or manage certificates. You `federation init`, `federation join`, and your agents start talking. The protocol handles identity, the PII pipeline handles data safety, and the audit trail handles compliance.

<details>
<summary><strong>Federation capabilities</strong></summary>

| | Capability | How it works |
|---|---|---|
| 🔒 | **Zero-trust federation** | Remote agents start untrusted. Identity proven via mTLS + ed25519 challenge-response. No API keys, no shared secrets. |
| 🛡️ | **PII-gated data flow** | 14-type detection pipeline scans every outbound message. Per-trust-level policies: BLOCK, REDACT, HASH, or PASS. Adaptive calibration reduces false positives. |
| 📊 | **Behavioral trust scoring** | Formula (`0.4×success + 0.2×uptime + 0.2×threat + 0.2×integrity`) continuously evaluates peers. Upgrades require history; downgrades are instant. |
| 📋 | **Compliance built-in** | HIPAA, SOC2, GDPR audit trails as compliance modes. Every federation event produces a structured record searchable via HNSW. |
| 🤝 | **9 MCP tools + 10 CLI commands** | Full lifecycle: `federation_init`, `federation_send`, `federation_trust`, `federation_audit`, and more. |

</details>

<details>
<summary><strong>Example: two teams sharing fraud signals without sharing customer data</strong></summary>

```bash
# Team A: initialize federation and generate keypair
npx claude-flow@latest federation init

# Team A: join Team B's federation endpoint
npx claude-flow@latest federation join wss://team-b.example.com:8443

# Team A: send a task — PII is stripped automatically before it leaves
npx claude-flow@latest federation send --to team-b --type task-request \
  --message "Analyze transaction patterns for account anomalies"

# Team A: check peer trust levels and session health
npx claude-flow@latest federation status
```

</details>

See [issue #1669](https://github.com/ruvnet/ruflo/issues/1669) for the complete architecture, trust model, and implementation roadmap.

```bash
# Claude Code plugin
/plugin install ruflo-federation@ruflo

# Or via CLI
npx claude-flow@latest plugins install @claude-flow/plugin-agent-federation
```

<details>
<summary><strong>Claude Code: With vs Without Ruflo</strong></summary>

| Capability | Claude Code Alone | + Ruflo |
|------------|-------------------|---------|
| Agent Collaboration | Isolated, no shared context | Swarms with shared memory and consensus |
| Coordination | Manual orchestration | Queen-led hierarchy (Raft, Byzantine, Gossip) |
| Memory | Session-only | HNSW vector memory with sub-ms retrieval |
| Learning | Static behavior | SONA self-learning with pattern matching |
| Task Routing | You decide | Intelligent routing (89% accuracy) |
| Background Workers | None | 12 auto-triggered workers |
| LLM Providers | Anthropic only | 5 providers with failover |
| Security | Standard | CVE-hardened with AIDefence |

</details>

<details>
<summary><strong>Architecture overview</strong></summary>

```
User --> Claude Code / CLI
          |
          v
    Orchestration Layer
    (MCP Server, Router, 27 Hooks)
          |
          v
    Swarm Coordination
    (Queen, Topology, Consensus)
          |
          v
    100+ Specialized Agents
    (coder, tester, reviewer, architect, security...)
          |
          v
    Memory & Learning
    (AgentDB, HNSW, SONA, ReasoningBank)
          |
          v
    LLM Providers
    (Claude, GPT, Gemini, Cohere, Ollama)
```

</details>

---

## Documentation

Full documentation including architecture, configuration, CLI reference, API usage, plugin development, and advanced topics:

**[User Guide](docs/USERGUIDE.md)** -- Complete reference documentation

| Section | Topics |
|---------|--------|
| [Quick Start](docs/USERGUIDE.md#quick-start) | Installation, prerequisites, install profiles |
| [Core Features](docs/USERGUIDE.md#-core-features) | MCP tools, agents, memory, neural learning |
| [Intelligence & Learning](docs/USERGUIDE.md#-intelligence--learning) | Hooks, workers, SONA, model routing |
| [Swarm & Coordination](docs/USERGUIDE.md#-swarm--coordination) | Topologies, consensus, hive mind |
| [Security](docs/USERGUIDE.md#%EF%B8%8F-security) | AIDefence, CVE remediation, validation |
| [Ecosystem](docs/USERGUIDE.md#-ecosystem--integrations) | RuVector, agentic-flow, Flow Nexus |
| [Configuration](docs/USERGUIDE.md#%EF%B8%8F-configuration--reference) | Environment variables, config schema |
| [Plugin Marketplace](https://ruvnet.github.io/ruflo) | Browse and install plugins |

---

## Support

| Resource | Link |
|----------|------|
| Documentation | [User Guide](docs/USERGUIDE.md) |
| Issues & Bugs | [GitHub Issues](https://github.com/ruvnet/claude-flow/issues) |
| Enterprise | [ruv.io](https://ruv.io) |
| Community | [Agentics Foundation Discord](https://discord.com/invite/dfxmpwkG2D) |
| Powered by | [Cognitum.one](https://cognitum.one) |

## License

MIT - [RuvNet](https://github.com/ruvnet)
