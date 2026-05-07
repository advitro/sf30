---
name: iot
description: Manage Cognitum Seed IoT devices, fleets, firmware, and telemetry
---
$ARGUMENTS
Manage IoT Cognitum Seed devices. Parse subcommand from $ARGUMENTS.

Usage: /iot <subcommand> [options]

Subcommands:
- `register <endpoint>` — Register a Seed device by HTTP endpoint
- `status <device-id>` — Refresh device state and trust score
- `list` — List all registered devices
- `pair <device-id>` — Pair device, promote trust level
- `unpair <device-id>` — Unpair device, demote trust level
- `remove <device-id>` — Deregister and close device connection
- `query <device-id> --vector "[...]" --k N` — k-NN vector store search
- `ingest <device-id>` — Ingest telemetry vectors
- `mesh <device-id>` — View mesh network topology
- `witness <device-id>` — View witness chain
- `witness verify <device-id>` — Verify witness chain integrity
- `fleet create --name NAME` — Create a device fleet
- `fleet list` — List all fleets
- `fleet add <fleet-id> <device-id>` — Add device to fleet
- `fleet remove <fleet-id> <device-id>` — Remove device from fleet
- `fleet delete <fleet-id>` — Delete fleet
- `firmware deploy <fleet-id> --version VER` — Start firmware rollout
- `firmware advance <rollout-id>` — Advance rollout stage
- `firmware rollback <rollout-id>` — Force rollback
- `firmware status <rollout-id>` — Rollout status
- `firmware list` — List all rollouts
- `anomalies <device-id>` — Detect telemetry anomalies
- `baseline <device-id> [--compute]` — View or recompute telemetry baseline

Steps by subcommand:

**register**: `npx @claude-flow/cli@latest iot register ENDPOINT`
**status**: `npx @claude-flow/cli@latest iot status DEVICE_ID`
**list**: `npx @claude-flow/cli@latest iot list`
**pair**: `npx @claude-flow/cli@latest iot pair DEVICE_ID`
**unpair**: `npx @claude-flow/cli@latest iot unpair DEVICE_ID`
**remove**: `npx @claude-flow/cli@latest iot remove DEVICE_ID`
**query**: `npx @claude-flow/cli@latest iot query DEVICE_ID --vector "VECTOR" --k K`
**ingest**: `npx @claude-flow/cli@latest iot ingest DEVICE_ID`
**mesh**: `npx @claude-flow/cli@latest iot mesh DEVICE_ID`
**witness**: `npx @claude-flow/cli@latest iot witness DEVICE_ID`
**witness verify**: `npx @claude-flow/cli@latest iot witness verify DEVICE_ID`
**fleet create**: `npx @claude-flow/cli@latest iot fleet create --name NAME`
**fleet list**: `npx @claude-flow/cli@latest iot fleet list`
**fleet add**: `npx @claude-flow/cli@latest iot fleet add FLEET_ID DEVICE_ID`
**fleet remove**: `npx @claude-flow/cli@latest iot fleet remove FLEET_ID DEVICE_ID`
**fleet delete**: `npx @claude-flow/cli@latest iot fleet delete FLEET_ID`
**firmware deploy**: `npx @claude-flow/cli@latest iot firmware deploy FLEET_ID --version VERSION`
**firmware advance**: `npx @claude-flow/cli@latest iot firmware advance ROLLOUT_ID`
**firmware rollback**: `npx @claude-flow/cli@latest iot firmware rollback ROLLOUT_ID`
**firmware status**: `npx @claude-flow/cli@latest iot firmware status ROLLOUT_ID`
**firmware list**: `npx @claude-flow/cli@latest iot firmware list`
**anomalies**: `npx @claude-flow/cli@latest iot anomalies DEVICE_ID`
**baseline**: `npx @claude-flow/cli@latest iot baseline DEVICE_ID --compute`
