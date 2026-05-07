---
name: federation
description: Manage cross-installation agent federation
---
$ARGUMENTS
Manage federation peers, trust, and audit logs. Parse subcommand from $ARGUMENTS.

Usage: /federation <subcommand> [options]

Subcommands:
- `init` -- Generate keypair and initialize federation
- `join <endpoint>` -- Connect to a federation peer
- `leave` -- Leave the federation gracefully
- `peers` -- List known peers with trust levels
- `status` -- Show federation health, sessions, metrics
- `audit [--compliance hipaa|soc2|gdpr] [--since DATE]` -- Query audit logs
- `trust <node-id> [--review]` -- View trust score breakdown
- `config [--pii-policy PATH]` -- Configure PII policies and compliance mode

Steps by subcommand:

**init**: `npx @claude-flow/cli@latest federation init`
**join**: `npx @claude-flow/cli@latest federation join ENDPOINT`
**leave**: `npx @claude-flow/cli@latest federation leave`
**peers**: `npx @claude-flow/cli@latest federation peers`
**status**: `npx @claude-flow/cli@latest federation status`
**audit**: `npx @claude-flow/cli@latest federation audit --compliance MODE --since DATE`
**trust**: `npx @claude-flow/cli@latest federation trust NODE_ID --review`
**config**: `npx @claude-flow/cli@latest federation config --pii-policy PATH`
