# Lando MCP Server (`lando mcp`)

Model Context Protocol (MCP) server for [Lando](https://lando.dev), exposing both global Lando commands and dynamic, project-specific tooling (such as `wp`, `composer`, `npm`, `worker`, etc.) directly to AI agents via stdio JSON-RPC.

## Installation

As a Lando plugin:
```bash
ln -s /path/to/lando-mcp ~/.lando/plugins/lando-mcp
lando --clear
```

Now `lando mcp` will be available directly as a Lando CLI task.

Or install standalone:
```bash
npm install
npm link
```

## Usage

### As Lando Task
```bash
lando mcp
lando mcp --project /path/to/my-site
```

### Standalone CLI
```bash
./bin/lando-mcp.js
./bin/lando-mcp.js --project /path/to/my-site
```

## Features & Available Tools

### 1. Core Lifecycle & Global Tools
- `lando_list`: List all known Lando apps and their running status.
- `lando_info`: Inspect app metadata, URLs, exposed ports, and services.
- `lando_start`, `lando_stop`, `lando_restart`, `lando_rebuild`, `lando_destroy`.
- `lando_logs`: Fetch container logs with optional tail and service filtering.
- `lando_poweroff`: Shut down all Lando containers and proxy engines globally.
- `lando_config`: Retrieve Lando's effective runtime configuration.

### 2. Execution Tools
- `lando_exec`: Run arbitrary CLI commands inside a container or app context.
- `lando_ssh`: Run bash commands directly via `lando ssh`.

### 3. Dynamic Tool Discovery
Because Lando tooling differs per project (e.g. WordPress projects have `wp`, Node apps have `npm`, Python apps have `pip`/`poetry`), this server implements dynamic discovery:
- `lando_discover_tools`: Scans `.lando.yml` and the corresponding recipe cache to detect all defined project commands and their descriptions. Also registers them dynamically as MCP tools with `sendToolListChanged()`.
- `lando_run_tool`: Generic fallback tool runner (`tool`, `project`, `args`).
- `lando_set_active_project`: Switch active working project context.
- `lando_tool_<toolname>`: Project-specific tools registered dynamically (e.g. `lando_tool_wp`, `lando_tool_composer`, `lando_tool_npm`).

## Architecture & Safety
- **Stdio Isolation**: Only clean JSON-RPC protocol messages are written to `stdout`. All logs, diagnostics, and debugging are strictly routed to `stderr`.
- **Pre-flight Health Checks**: Validates Docker daemon status prior to executing lifecycle operations.
- **Auto Non-Interactive**: Injects `-y` / `--yes` to prevent Lando prompts from stalling MCP client interactions.
- **ANSI Sanitization**: Strips terminal escape codes from command outputs.
