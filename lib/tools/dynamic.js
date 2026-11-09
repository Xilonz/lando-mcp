'use strict';

const { z } = require('zod');
const { runLandoCommand } = require('../executor');
const { discoverProjectTooling, findProjectRoot } = require('../discovery');
const { resolvePath } = require('./core');

const registeredToolNames = new Set();

/**
 * Registers dynamic project tools on the MCP server.
 */
function registerDynamicProjectTools(server, tools = [], getContextPath) {
  let hasNewTools = false;

  for (const tool of tools) {
    const cleanName = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const toolIdentifier = `lando_tool_${cleanName}`;

    if (!registeredToolNames.has(toolIdentifier)) {
      registeredToolNames.add(toolIdentifier);
      hasNewTools = true;

      server.tool(
        toolIdentifier,
        tool.description || `Runs lando ${tool.name} command in ${tool.service || 'appserver'}. Usage: ${tool.usage || tool.name}`,
        {
          args: z
            .union([z.array(z.string()), z.string()])
            .optional()
            .describe('Arguments or flags to pass to the command (e.g. ["plugin", "list"] or "plugin list")'),
          path: z
            .string()
            .optional()
            .describe('Path to project directory (defaults to active project / cwd)'),
        },
        async ({ args = [], path: projectPath }) => {
          const cwd = resolvePath(projectPath, getContextPath());
          const finalArgs = [tool.name];

          if (Array.isArray(args)) {
            finalArgs.push(...args);
          } else if (typeof args === 'string' && args.trim().length > 0) {
            // Split shell args while preserving quotes if possible
            finalArgs.push(...args.trim().split(/\s+/));
          }

          const res = await runLandoCommand(finalArgs, { cwd, timeoutMs: 300000, requireDocker: true });
          return {
            content: [
              {
                type: 'text',
                text: res.data ? JSON.stringify(res.data, null, 2) : (res.stdout || res.stderr || (res.success ? 'Command executed successfully.' : 'Command execution failed.')),
              },
            ],
            isError: !res.success,
          };
        }
      );
    }
  }

  if (hasNewTools) {
    try {
      server.sendToolListChanged();
    } catch (_) {
      // Ignore if not connected yet
    }
  }
}

/**
 * Registers dynamic discovery and generic runner tools.
 */
function registerDynamicTools(server, context) {
  // 1. lando_discover_tools
  server.tool(
    'lando_discover_tools',
    'Inspects a Lando project to discover available tooling commands (wp, composer, npm, artisan, etc.), recipe, and services.',
    {
      path: z
        .string()
        .optional()
        .describe('Path to project directory containing .lando.yml (defaults to active project / cwd)'),
    },
    async ({ path: projectPath }) => {
      const targetDir = resolvePath(projectPath, context.activePath);
      const discovery = discoverProjectTooling(targetDir);

      if (!discovery.isApp) {
        return {
          content: [
            {
              type: 'text',
              text: `No Lando project (.lando.yml) found in or above: ${targetDir}`,
            },
          ],
          isError: true,
        };
      }

      // Register discovered project tools dynamically on the MCP server
      registerDynamicProjectTools(server, discovery.tools, () => context.activePath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(discovery, null, 2),
          },
        ],
      };
    }
  );

  // 2. lando_run_tool
  server.tool(
    'lando_run_tool',
    'Runs any project-specific Lando tooling command (e.g. wp, composer, artisan, npm, worker) in the project context.',
    {
      tool: z.string().describe('The command/tool name (e.g. wp, composer, npm, mysql, artisan)'),
      args: z
        .union([z.array(z.string()), z.string()])
        .optional()
        .describe('Arguments or flags to pass to the tool (e.g. ["status"] or "--version")'),
      path: z
        .string()
        .optional()
        .describe('Path to project directory (defaults to active project / cwd)'),
    },
    async ({ tool, args = [], path: projectPath }) => {
      if (!tool) {
        return {
          content: [{ type: 'text', text: 'Error: tool parameter is required.' }],
          isError: true,
        };
      }

      const cwd = resolvePath(projectPath, context.activePath);
      const finalArgs = [tool];

      if (Array.isArray(args)) {
        finalArgs.push(...args);
      } else if (typeof args === 'string' && args.trim().length > 0) {
        finalArgs.push(...args.trim().split(/\s+/));
      }

      const res = await runLandoCommand(finalArgs, { cwd, timeoutMs: 300000, requireDocker: true });
      return {
        content: [
          {
            type: 'text',
            text: res.data ? JSON.stringify(res.data, null, 2) : (res.stdout || res.stderr || (res.success ? 'Command executed successfully.' : 'Command execution failed.')),
          },
        ],
        isError: !res.success,
      };
    }
  );

  // 3. lando_set_active_project
  server.tool(
    'lando_set_active_project',
    'Sets the active project directory for subsequent Lando operations and dynamically loads its tools.',
    {
      path: z.string().describe('Path to the project directory containing .lando.yml'),
    },
    async ({ path: projectPath }) => {
      const root = findProjectRoot(projectPath);
      if (!root) {
        return {
          content: [{ type: 'text', text: `Could not find a .lando.yml in or above: ${projectPath}` }],
          isError: true,
        };
      }

      context.activePath = root;
      const discovery = discoverProjectTooling(root);
      registerDynamicProjectTools(server, discovery.tools, () => context.activePath);

      return {
        content: [
          {
            type: 'text',
            text: `Active project set to ${root} (${discovery.name}). ${discovery.tools.length} project tools discovered and registered.`,
          },
        ],
      };
    }
  );
}

module.exports = {
  registerDynamicTools,
  registerDynamicProjectTools,
};
