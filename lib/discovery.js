'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

/**
 * Standard known tooling for standard Lando recipes when cache file has not yet been built.
 */
const DEFAULT_RECIPE_TOOLING = {
  wordpress: {
    wp: { service: 'appserver', description: 'Runs wp commands' },
    composer: { service: 'appserver', description: 'Runs composer commands' },
    php: { service: 'appserver', description: 'Runs php commands' },
    mysql: { service: 'database', description: 'Drops into MySQL shell on database service' },
    'db-export': { service: 'database', description: 'Exports database to a file' },
    'db-import': { service: 'database', description: 'Imports database dump file' },
  },
  'sowmedia-wordpress': {
    wp: { service: 'appserver', description: 'Runs wp commands' },
    composer: { service: 'appserver', description: 'Runs composer commands' },
    php: { service: 'appserver', description: 'Runs php commands' },
    mysql: { service: 'database', description: 'Drops into MySQL shell on database service' },
    'db-export': { service: 'database', description: 'Exports database to a file' },
    'db-import': { service: 'database', description: 'Imports database dump file' },
  },
  laravel: {
    artisan: { service: 'appserver', description: 'Runs artisan commands' },
    composer: { service: 'appserver', description: 'Runs composer commands' },
    php: { service: 'appserver', description: 'Runs php commands' },
    mysql: { service: 'database', description: 'Drops into MySQL shell on database service' },
  },
  lamp: {
    composer: { service: 'appserver', description: 'Runs composer commands' },
    php: { service: 'appserver', description: 'Runs php commands' },
    mysql: { service: 'database', description: 'Drops into MySQL shell on database service' },
  },
  lemp: {
    composer: { service: 'appserver', description: 'Runs composer commands' },
    php: { service: 'appserver', description: 'Runs php commands' },
    mysql: { service: 'database', description: 'Drops into MySQL shell on database service' },
  },
  mean: {
    node: { service: 'appserver', description: 'Runs node commands' },
    npm: { service: 'appserver', description: 'Runs npm commands' },
    mongo: { service: 'database', description: 'Drops into Mongo shell' },
  },
};

/**
 * Traverses upwards to find the directory containing a Lando configuration file.
 */
function findProjectRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  const candidateFiles = [
    '.lando.yml',
    '.lando.yaml',
    '.lando.base.yml',
    '.lando.dist.yml',
    '.lando.local.yml',
  ];

  while (current !== root) {
    for (const file of candidateFiles) {
      if (fs.existsSync(path.join(current, file))) {
        return current;
      }
    }
    current = path.dirname(current);
  }

  return null;
}

/**
 * Loads and merges all Lando YAML files in a directory.
 */
function loadLandofiles(projectDir) {
  const order = [
    '.lando.base.yml',
    '.lando.dist.yml',
    '.lando.yml',
    '.lando.yaml',
    '.lando.local.yml',
  ];

  let mergedConfig = {};

  for (const filename of order) {
    const fullPath = path.join(projectDir, filename);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = yaml.load(content) || {};
        mergedConfig = { ...mergedConfig, ...parsed };
      } catch (err) {
        // Continue merging what we can
      }
    }
  }

  return mergedConfig;
}

/**
 * Discovers tooling commands for a given project directory.
 */
function discoverProjectTooling(targetPath = process.cwd()) {
  const projectRoot = findProjectRoot(targetPath);
  if (!projectRoot) {
    return {
      isApp: false,
      root: null,
      name: null,
      recipe: null,
      services: [],
      tools: [],
    };
  }

  const appConfig = loadLandofiles(projectRoot);
  const appName = appConfig.name || path.basename(projectRoot);
  const recipe = appConfig.recipe || null;
  const userConfRoot = path.join(os.homedir(), '.lando');

  let toolingMap = {};

  // 1. Add default recipe tooling if known
  if (recipe && DEFAULT_RECIPE_TOOLING[recipe]) {
    toolingMap = { ...toolingMap, ...DEFAULT_RECIPE_TOOLING[recipe] };
  }

  // 2. Check cached recipe tooling in ~/.lando/cache/<appName>.recipe.cache
  const recipeCacheFile = path.join(userConfRoot, 'cache', `${appName}.recipe.cache`);
  if (fs.existsSync(recipeCacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(recipeCacheFile, 'utf8'));
      if (cached && cached.tooling) {
        toolingMap = { ...toolingMap, ...cached.tooling };
      }
    } catch (_) {
      // Ignore cache parse error
    }
  }

  // 3. Merge project-specific tooling from .lando.yml (overrides recipe tooling)
  if (appConfig.tooling && typeof appConfig.tooling === 'object') {
    toolingMap = { ...toolingMap, ...appConfig.tooling };
  }

  // Normalize tools into structured list and deduplicate by commandName
  const toolsMapByName = new Map();
  for (const [rawCommand, def] of Object.entries(toolingMap)) {
    if (!def) continue;

    // Command might be defined like "db-import <file>" or "db-export [file]"
    const commandName = rawCommand.split(' ')[0];
    const isObject = typeof def === 'object';

    const toolObj = {
      name: commandName,
      rawCommand,
      service: isObject ? (def.service || 'appserver') : 'appserver',
      description: isObject ? (def.description || `Runs ${commandName} in ${def.service || 'appserver'}`) : `Runs ${commandName}`,
      cmd: isObject ? (def.cmd || commandName) : commandName,
      usage: `lando ${rawCommand}`,
      options: isObject && def.options ? def.options : {},
    };

    toolsMapByName.set(commandName, toolObj);
  }

  const tools = Array.from(toolsMapByName.values());

  // Collect configured services
  const services = Object.keys(appConfig.services || {});
  if (recipe && !services.includes('appserver')) {
    services.unshift('appserver');
  }

  return {
    isApp: true,
    root: projectRoot,
    name: appName,
    recipe,
    services,
    tools,
  };
}

module.exports = {
  findProjectRoot,
  loadLandofiles,
  discoverProjectTooling,
};
