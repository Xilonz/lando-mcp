'use strict';

/**
 * Lando task definition for `lando mcp`.
 */
module.exports = lando => ({
  command: 'mcp',
  describe: 'Runs the Lando Model Context Protocol (MCP) server for AI assistants',
  level: 'tasks',
  options: {
    project: {
      describe: 'Initial project path context',
      alias: ['p'],
      string: true,
    },
  },
  run: async options => {
    const startServer = require('../lib/server');
    return startServer(lando, options);
  },
});
