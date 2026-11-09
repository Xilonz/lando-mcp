'use strict';

const { z } = require('zod');
const { runLandoCommand } = require('../executor');
const { resolvePath } = require('./core');

/**
 * Registers container execution tools using Zod schemas.
 */
function registerExecTools(server, getContextPath) {
  // 1. lando_exec
  server.tool(
    'lando_exec',
    'Runs arbitrary command(s) on a service container (e.g. lando exec appserver -- ls -la).',
    {
      service: z.string().describe('Target container service (e.g. appserver, database, node, worker)'),
      command: z.string().describe('Command string to run inside the container'),
      path: z.string().optional().describe('Path to project directory (defaults to active project / cwd)'),
      user: z.string().optional().describe('User to run the command as (e.g. root, www-data)'),
    },
    async ({ service, command, path: projectPath, user }) => {
      if (!service || !command) {
        return {
          content: [{ type: 'text', text: 'Error: Both service and command arguments are required.' }],
          isError: true,
        };
      }

      const cwd = resolvePath(projectPath, getContextPath());
      const args = ['exec', service];
      if (user) args.push('--user', user);
      args.push('--', command);

      const res = await runLandoCommand(args, { cwd, timeoutMs: 180000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'Command executed with no output.' : 'Command execution failed.') }],
        isError: !res.success,
      };
    }
  );

  // 2. lando_ssh
  server.tool(
    'lando_ssh',
    'Runs a command or opens an SSH session on a service (e.g. lando ssh -s appserver -c "php -v").',
    {
      service: z.string().optional().describe('Target container service (defaults to appserver)'),
      command: z.string().optional().describe('Command to run in the service container via SSH'),
      path: z.string().optional().describe('Path to project directory (defaults to active project / cwd)'),
      user: z.string().optional().describe('User to SSH in as (e.g. root, www-data)'),
    },
    async ({ service = 'appserver', command, path: projectPath, user }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const args = ['ssh', '--service', service];
      if (user) args.push('--user', user);
      if (command) args.push('--command', command);

      const res = await runLandoCommand(args, { cwd, timeoutMs: 180000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'SSH command executed with no output.' : 'SSH execution failed.') }],
        isError: !res.success,
      };
    }
  );
}

module.exports = { registerExecTools };
