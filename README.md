# Lando MCP Server Plugin

[![Lando API 3](https://img.shields.io/badge/lando-v3.x-blue.svg)](https://lando.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server for [Lando](https://lando.dev), exposing global Lando container management and dynamic, project-specific tooling (WP-CLI, Composer, NPM, Artisan, Python workers, etc.) directly to AI coding assistants via stdio JSON-RPC.

---

## Why do I need this?

Modern AI coding assistants (such as Google Antigravity, Claude Code, Cursor, and Windsurf) can interact with local development environments. However, working with Lando via raw terminal commands introduces common failure modes:

1. **Context-Dependent Tooling**: In Lando, available commands depend entirely on the active project and its recipe. A WordPress project has `lando wp` and `lando composer`; a Node.js project has `lando npm`; a Python project might have `lando worker` or `lando memray`. Traditional MCP servers have static tool manifests that cannot adapt to project tooling.
2. **Interactive Prompts**: Commands like `lando destroy`, `lando rebuild`, or `lando init` often prompt for interactive user confirmation, which stalls automated AI agents indefinitely.
3. **Stdio Protocol Corruption**: MCP communicates over `stdout` using JSON-RPC 2.0. If Lando or a plugin writes CLI banners, update notices, or debugging logs to `stdout`, the MCP stream is corrupted and the connection drops.
4. **Subprocess Hijacking**: Because Lando CLI is compiled using `@vercel/pkg`, child processes inherit runtime environment variables that can cause child `lando` calls to misinterpret command names as Node.js script paths.

**This plugin eliminates all of that.** It exposes clean, structured tools with Docker pre-flight checks, automatic non-interactive flags, strict stdio stream guarding, `env -i` subprocess isolation, and on-demand dynamic tooling discovery.

---

## Key Features

- **Native Lando CLI Task (`lando mcp`)**: Runs directly as a native Lando plugin task, inheriting Lando's environment and configuration.
- **Standalone CLI Runner**: Can also run independently via `./bin/lando-mcp.js` or `npx @xilonz/lando-mcp`.
- **Dynamic Tool Discovery**:
  - Automatically parses `.lando.yml` and compiled recipe caches to detect project tooling.
  - Dynamically registers project-specific tools (e.g. `lando_tool_wp`, `lando_tool_composer`, `lando_tool_npm`, `lando_tool_worker`) and notifies the client via `sendToolListChanged()`.
- **Strict Stdio Isolation**: All logging, diagnostics, and debug outputs are forcefully redirected to `stderr`. Only pure JSON-RPC messages are emitted on `stdout`.
- **Subprocess Environment Isolation**: Executes child Lando processes via `env -i` with a sanitized variable set (`PATH`, `HOME`, `USER`, Docker/Compose variables), preventing `@vercel/pkg` internal runtime state leaks.
- **Fail-Safe Execution**:
  - Docker daemon pre-flight checks before attempting container lifecycle commands.
  - Automatically appends non-interactive flags (`-y` / `--yes`) to destructive operations.
  - Strips ANSI escape codes from command outputs for clean LLM token consumption.

---

## Available MCP Tools

### 1. Core Lifecycle & Global Management
| Tool | Description |
| --- | --- |
| `lando_list` | Lists all running Lando apps and containers across the system in structured JSON. |
| `lando_info` | Returns detailed app metadata (URLs, database credentials, exposed ports, services). |
| `lando_start` | Starts containers for a Lando app. |
| `lando_stop` | Stops containers for a Lando app. |
| `lando_restart` | Restarts containers for a Lando app. |
| `lando_rebuild` | Rebuilds an app from scratch (`--yes`), preserving database volumes. |
| `lando_destroy` | Destroys an app and removes its containers and networks (`--yes`). |
| `lando_logs` | Fetches container logs with optional service filtering and timestamps. |
| `lando_poweroff` | Spins down all Lando-related containers and proxy engines globally. |
| `lando_config` | Displays merged global and project Lando runtime configuration. |

### 2. Scaffolding & Maintenance
| Tool | Description |
| --- | --- |
| `lando_init` | Scaffolds a new Landofile (`.lando.yml`) with recipe, name, webroot, and source options. |
| `lando_recipes` | Lists available Lando recipes (e.g. `sowmedia-wordpress`, `wordpress`, `lamp`, `laravel`, etc.). |
| `lando_version` | Returns installed Lando CLI version information. |
| `lando_clear_cache` | Clears Lando tasks, recipes, and plugins cache (`lando --clear`). |

### 3. Container Execution
| Tool | Description |
| --- | --- |
| `lando_exec` | Runs arbitrary commands inside a specific container service (e.g. `appserver`, `database`). |
| `lando_ssh` | Runs a command or script via `lando ssh`. |

### 4. Dynamic Project Tooling
| Tool | Description |
| --- | --- |
| `lando_discover_tools` | Inspects a project directory, discovers available tooling commands, and registers them dynamically. |
| `lando_run_tool` | Generic runner for executing any project tooling command with arguments. |
| `lando_set_active_project` | Switches the active project context and reloads registered project tools. |
| `lando_tool_<name>` | Dynamically registered tools specific to the active project (e.g., `lando_tool_wp`, `lando_tool_composer`, `lando_tool_npm`, `lando_tool_worker`). |

---

## Installation

### Via Lando CLI (Recommended)

Install directly from npm via Lando's plugin manager:

```bash
lando plugin-add @xilonz/lando-mcp
```

### Manual / Git Installation

Clone or symlink the repository into your user plugins directory:

```bash
mkdir -p ~/.lando/plugins
git clone https://github.com/Xilonz/lando-mcp.git ~/.lando/plugins/lando-mcp
```

Or from a local development checkout:

```bash
ln -s ~/projects/lando-mcp ~/.lando/plugins/lando-mcp
```

Clear Lando's plugin cache to register the task:

```bash
lando --clear
```

Verify that `lando mcp` appears in the task list:

```bash
lando --help | grep mcp
```

---

## Configuration in MCP Clients

### 1. Google Antigravity (`mcp_config.json`)

Add the server to your `~/.gemini/antigravity/mcp_config.json` (or `~/.gemini/config/mcp_config.json`):

```json
{
  "mcpServers": {
    "lando": {
      "command": "lando",
      "args": ["mcp"]
    }
  }
}
```

### 2. Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "lando": {
      "command": "lando",
      "args": ["mcp"]
    }
  }
}
```

### 3. Standalone CLI with Pre-set Project Context

If you prefer pointing the MCP server directly at a specific repository:

```json
{
  "mcpServers": {
    "lando-myproject": {
      "command": "lando",
      "args": ["mcp", "--project", "/path/to/my-project"]
    }
  }
}
```

Or via the standalone runner:

```json
{
  "mcpServers": {
    "lando-standalone": {
      "command": "node",
      "args": ["/path/to/lando-mcp/bin/lando-mcp.js", "--project", "/path/to/my-project"]
    }
  }
}
```

---

## Testing

The plugin includes an end-to-end JSON-RPC test client that verifies the handshake, tool enumeration, dynamic discovery, `lando_version`, `lando_recipes`, and `lando_init`:

```bash
npm test
```

---

## License

MIT © [Arjan Steenbergen](https://github.com/Xilonz)
