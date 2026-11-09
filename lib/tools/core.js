'use strict';

const { z } = require('zod');
const { runLandoCommand } = require('../executor');
const { findProjectRoot } = require('../discovery');

function resolvePath(inputPath, fallbackDir) {
  if (inputPath) return findProjectRoot(inputPath) || inputPath;
  if (fallbackDir) return findProjectRoot(fallbackDir) || fallbackDir;
  return process.cwd();
}

/**
 * Registers core Lando lifecycle tools using Zod schemas.
 */
function registerCoreTools(server, getContextPath) {
  // 1. lando_list
  server.tool(
    'lando_list',
    'Lists all running Lando apps and containers across the system.',
    {},
    async () => {
      const res = await runLandoCommand(['list', '--format', 'json'], { requireDocker: true });
      if (!res.success) {
        return {
          content: [{ type: 'text', text: `Error running lando list: ${res.stderr || res.stdout}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: res.data ? JSON.stringify(res.data, null, 2) : (res.stdout || 'No active Lando apps found.'),
          },
        ],
      };
    }
  );

  // 2. lando_info
  server.tool(
    'lando_info',
    'Prints detailed info about a Lando app (URLs, database credentials, exposed ports, service configs).',
    {
      path: z.string().optional().describe('Path to project directory containing .lando.yml (defaults to active project / cwd)'),
      deep: z.boolean().optional().describe('Get deep inspection info'),
      service: z.string().optional().describe('Filter info to a specific service (e.g. appserver, database)'),
    },
    async ({ path: projectPath, deep, service }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const args = ['info', '--format', 'json'];
      if (deep) args.push('--deep');
      if (service) args.push('--service', service);

      const res = await runLandoCommand(args, { cwd, requireDocker: true });
      if (!res.success) {
        return {
          content: [{ type: 'text', text: `Error running lando info in ${cwd}: ${res.stderr || res.stdout}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: res.data ? JSON.stringify(res.data, null, 2) : res.stdout,
          },
        ],
      };
    }
  );

  // 3. lando_start
  server.tool(
    'lando_start',
    'Starts containers for a Lando app.',
    {
      path: z.string().optional().describe('Path to project directory containing .lando.yml (defaults to active project / cwd)'),
    },
    async ({ path: projectPath }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const res = await runLandoCommand(['start'], { cwd, timeoutMs: 300000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'App started successfully.' : 'Failed to start app.') }],
        isError: !res.success,
      };
    }
  );

  // 4. lando_stop
  server.tool(
    'lando_stop',
    'Stops containers for a Lando app.',
    {
      path: z.string().optional().describe('Path to project directory containing .lando.yml (defaults to active project / cwd)'),
    },
    async ({ path: projectPath }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const res = await runLandoCommand(['stop'], { cwd, timeoutMs: 120000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'App stopped successfully.' : 'Failed to stop app.') }],
        isError: !res.success,
      };
    }
  );

  // 5. lando_restart
  server.tool(
    'lando_restart',
    'Restarts containers for a Lando app.',
    {
      path: z.string().optional().describe('Path to project directory containing .lando.yml (defaults to active project / cwd)'),
    },
    async ({ path: projectPath }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const res = await runLandoCommand(['restart'], { cwd, timeoutMs: 300000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'App restarted successfully.' : 'Failed to restart app.') }],
        isError: !res.success,
      };
    }
  );

  // 6. lando_rebuild
  server.tool(
    'lando_rebuild',
    'Rebuilds a Lando app from scratch, preserving persistent database data.',
    {
      path: z.string().optional().describe('Path to project directory containing .lando.yml (defaults to active project / cwd)'),
      service: z.string().optional().describe('Rebuild only a specific service (e.g. appserver, database)'),
    },
    async ({ path: projectPath, service }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const args = ['rebuild', '--yes'];
      if (service) args.push('--service', service);

      const res = await runLandoCommand(args, { cwd, timeoutMs: 600000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'App rebuilt successfully.' : 'Rebuild failed.') }],
        isError: !res.success,
      };
    }
  );

  // 7. lando_destroy
  server.tool(
    'lando_destroy',
    'Destroys a Lando app and removes its containers and networks.',
    {
      path: z.string().optional().describe('Path to project directory containing .lando.yml (defaults to active project / cwd)'),
    },
    async ({ path: projectPath }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const res = await runLandoCommand(['destroy', '--yes'], { cwd, timeoutMs: 120000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'App destroyed successfully.' : 'Destroy failed.') }],
        isError: !res.success,
      };
    }
  );

  // 8. lando_logs
  server.tool(
    'lando_logs',
    'Displays logs for a Lando app or specific service.',
    {
      path: z.string().optional().describe('Path to project directory containing .lando.yml (defaults to active project / cwd)'),
      service: z.string().optional().describe('Get logs only for specified service (e.g. appserver, database)'),
      timestamps: z.boolean().optional().describe('Show timestamps in logs'),
    },
    async ({ path: projectPath, service, timestamps }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const args = ['logs'];
      if (service) args.push('--service', service);
      if (timestamps) args.push('--timestamps');

      const res = await runLandoCommand(args, { cwd, timeoutMs: 60000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || 'No logs captured.' }],
        isError: !res.success,
      };
    }
  );

  // 9. lando_poweroff
  server.tool(
    'lando_poweroff',
    'Spins down all Lando-related containers across all projects.',
    {},
    async () => {
      const res = await runLandoCommand(['poweroff'], { timeoutMs: 120000, requireDocker: true });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'Poweroff completed.' : 'Poweroff failed.') }],
        isError: !res.success,
      };
    }
  );

  // 10. lando_config
  server.tool(
    'lando_config',
    'Displays the parsed Lando configuration (global and project merged).',
    {
      path: z.string().optional().describe('Path to project directory (optional)'),
    },
    async ({ path: projectPath }) => {
      const cwd = resolvePath(projectPath, getContextPath());
      const res = await runLandoCommand(['config', '--format', 'json'], { cwd, requireDocker: false });
      return {
        content: [
          {
            type: 'text',
            text: res.data ? JSON.stringify(res.data, null, 2) : (res.stdout || res.stderr),
          },
        ],
        isError: !res.success,
      };
    }
  );

  // 11. lando_init
  server.tool(
    'lando_init',
    'Initializes a new Landofile (.lando.yml) for a project directory.',
    {
      path: z.string().optional().describe('Target directory where .lando.yml will be created (defaults to active project / cwd)'),
      name: z.string().optional().describe('The name of the app'),
      recipe: z.string().optional().describe('The recipe with which to initialize (e.g. sowmedia-wordpress, wordpress, lamp, lemp, laravel, drupal10, none)'),
      webroot: z.string().optional().describe('Specify the webroot relative to app root (e.g. web, public, html, .)'),
      source: z.enum(['cwd', 'github', 'remote', 'acquia', 'lagoon', 'pantheon', 'platformsh']).optional().describe('The location of your apps code (default: cwd)'),
      remoteUrl: z.string().optional().describe('URL of your git repo or archive when source is remote or github'),
      options: z.array(z.string()).optional().describe('Additional recipe KEY=VALUE options (e.g. ["php=8.2", "database=mariadb"])'),
    },
    async ({ path: projectPath, name, recipe, webroot, source = 'cwd', remoteUrl, options = [] }) => {
      const cwd = projectPath || getContextPath() || process.cwd();
      const args = ['init', '--source', source, '--yes'];
      if (name) args.push('--name', name);
      if (recipe) args.push('--recipe', recipe);
      if (webroot) args.push('--webroot', webroot);
      if (remoteUrl) args.push('--remote-url', remoteUrl);
      if (options && options.length > 0) {
        options.forEach(opt => args.push('--option', opt));
      }

      const res = await runLandoCommand(args, { cwd, timeoutMs: 120000, requireDocker: false });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || (res.success ? 'Lando app initialized successfully.' : 'Init failed.') }],
        isError: !res.success,
      };
    }
  );

  // 12. lando_version
  server.tool(
    'lando_version',
    'Displays Lando CLI version information.',
    {},
    async () => {
      const res = await runLandoCommand(['version'], { requireDocker: false });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || 'Unknown version' }],
        isError: !res.success,
      };
    }
  );

  // 13. lando_clear_cache
  server.tool(
    'lando_clear_cache',
    'Clears the Lando tasks, recipes, and plugins cache (equivalent to lando --clear).',
    {},
    async () => {
      const res = await runLandoCommand(['--clear'], { requireDocker: false });
      return {
        content: [{ type: 'text', text: res.stdout || res.stderr || 'Cache cleared.' }],
        isError: !res.success,
      };
    }
  );

  // 14. lando_recipes
  server.tool(
    'lando_recipes',
    'Lists available Lando recipes for use with lando_init (e.g. sowmedia-wordpress, wordpress, lamp, laravel, etc.).',
    {},
    async () => {
      const recipes = [
        { name: 'sowmedia-wordpress', description: 'Standard Sowmedia WordPress development stack' },
        { name: 'wordpress', description: 'Official Lando WordPress recipe' },
        { name: 'lamp', description: 'Linux, Apache, MySQL, PHP stack' },
        { name: 'lemp', description: 'Linux, NGINX, MySQL, PHP stack' },
        { name: 'laravel', description: 'Laravel framework recipe' },
        { name: 'symfony', description: 'Symfony framework recipe' },
        { name: 'drupal10', description: 'Drupal 10 recipe' },
        { name: 'drupal11', description: 'Drupal 11 recipe' },
        { name: 'drupal9', description: 'Drupal 9 recipe' },
        { name: 'drupal8', description: 'Drupal 8 recipe' },
        { name: 'drupal7', description: 'Drupal 7 recipe' },
        { name: 'drupal6', description: 'Drupal 6 recipe' },
        { name: 'backdrop', description: 'Backdrop CMS recipe' },
        { name: 'joomla', description: 'Joomla CMS recipe' },
        { name: 'mean', description: 'MongoDB, Express, Angular, Node stack' },
        { name: 'none', description: 'Empty recipe (custom service definitions only)' },
      ];
      return {
        content: [{ type: 'text', text: JSON.stringify(recipes, null, 2) }],
      };
    }
  );
}

module.exports = { registerCoreTools, resolvePath };
