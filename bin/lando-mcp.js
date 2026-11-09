#!/usr/bin/env node
'use strict';

const startServer = require('../lib/server');

// Parse --project or -p if provided
const args = process.argv.slice(2);
let projectPath = process.env.LANDO_PROJECT_PATH || process.cwd();

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--project' || args[i] === '-p') && args[i + 1]) {
    projectPath = args[i + 1];
    break;
  }
}

startServer(null, { project: projectPath }).catch(err => {
  console.error('[lando-mcp] Fatal server error:', err);
  process.exit(1);
});
