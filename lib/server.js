'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { registerCoreTools } = require('./tools/core');
const { registerExecTools } = require('./tools/exec');
const { registerDynamicTools, registerDynamicProjectTools } = require('./tools/dynamic');
const { findProjectRoot, discoverProjectTooling } = require('./discovery');

/**
 * Starts the Lando Model Context Protocol (MCP) server.
 *
 * @param {Object} [lando] - The active Lando instance (when called from lando task)
 * @param {Object} [options] - Options passed from CLI / task
 */
async function startServer(lando = null, options = {}) {
  // Guard stdout: redirect all console logging to stderr to keep JSON-RPC stream pure
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  const originalWarn = console.warn;

  console.log = (...args) => console.error('[lando-mcp:log]', ...args);
  console.info = (...args) => console.error('[lando-mcp:info]', ...args);
  console.debug = (...args) => console.error('[lando-mcp:debug]', ...args);
  console.warn = (...args) => console.error('[lando-mcp:warn]', ...args);

  // Initialize server
  const server = new McpServer({
    name: 'lando',
    version: '1.0.0',
  });

  // Resolve initial project context
  const initialPath = options.project || (options._app && options._app.root) || process.cwd();
  const projectRoot = findProjectRoot(initialPath);

  const context = {
    activePath: projectRoot || initialPath,
    lando,
  };

  // Register all tools
  registerCoreTools(server, () => context.activePath);
  registerExecTools(server, () => context.activePath);
  registerDynamicTools(server, context);

  // If started inside or targeting a specific Lando app, register its tools immediately
  if (projectRoot) {
    try {
      const discovery = discoverProjectTooling(projectRoot);
      registerDynamicProjectTools(server, discovery.tools, () => context.activePath);
      console.error(`[lando-mcp] Initialized in project '${discovery.name}' (${projectRoot}) with ${discovery.tools.length} project tools.`);
    } catch (err) {
      console.error(`[lando-mcp] Error discovering initial project tools: ${err.message}`);
    }
  } else {
    console.error(`[lando-mcp] Initialized in global mode (active path: ${context.activePath}).`);
  }

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[lando-mcp] Connected to stdio transport and ready for requests.');

  // Keep alive until stdin closes or termination signals
  return new Promise((resolve) => {
    const cleanup = () => {
      console.error('[lando-mcp] Shutting down server...');
      console.log = originalLog;
      console.info = originalInfo;
      console.debug = originalDebug;
      console.warn = originalWarn;
      resolve();
    };

    process.stdin.on('close', cleanup);
    process.stdin.on('end', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}

module.exports = startServer;
