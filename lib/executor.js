'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');

/**
 * Strips ANSI terminal escape sequences.
 */
function stripAnsi(str) {
  if (typeof str !== 'string') return str;
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Fast check to verify if Docker daemon is accessible.
 */
async function isDockerRunning(timeoutMs = 3000) {
  return new Promise(resolve => {
    execFile('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: timeoutMs }, (err, stdout) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Runs a Lando CLI command in a specified directory.
 *
 * @param {Array<string>} args - Command line arguments passed to `lando`
 * @param {Object} options
 * @param {string} [options.cwd] - Working directory
 * @param {number} [options.timeoutMs=120000] - Execution timeout
 * @param {boolean} [options.requireDocker=false] - Whether to verify Docker daemon first
 * @returns {Promise<{success: boolean, stdout: string, stderr: string, code: number, data?: any}>}
 */
async function runLandoCommand(args = [], options = {}) {
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs || 180000;
  const requireDocker = options.requireDocker !== false;

  if (requireDocker) {
    const dockerOk = await isDockerRunning();
    if (!dockerOk) {
      return {
        success: false,
        code: 1,
        stdout: '',
        stderr: 'Docker daemon is not running or not responding. Please start Docker first.',
      };
    }
  }

  return new Promise(resolve => {
    // Ensure non-interactive execution for destructive commands
    const finalArgs = [...args];
    const isDestructive = args.some(a => ['destroy', 'rebuild', 'init'].includes(a));
    if (isDestructive && !finalArgs.includes('--yes') && !finalArgs.includes('-y')) {
      finalArgs.push('--yes');
    }

    const child = spawn('lando', finalArgs, {
      cwd,
      env: {
        ...process.env,
        // Ensure no interactive inquiries
        CI: 'true',
        LANDO_NON_INTERACTIVE: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let isTimedOut = false;

    const timer = setTimeout(() => {
      isTimedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('close', code => {
      clearTimeout(timer);
      const cleanStdout = stripAnsi(stdout).trim();
      const cleanStderr = stripAnsi(stderr).trim();

      if (isTimedOut) {
        return resolve({
          success: false,
          code: -1,
          stdout: cleanStdout,
          stderr: `Command timed out after ${timeoutMs}ms: lando ${args.join(' ')}`,
        });
      }

      let parsedData;
      if (args.includes('--format') && (args.includes('json') || args.includes('JSON'))) {
        try {
          parsedData = JSON.parse(cleanStdout);
        } catch (_) {
          // Keep raw string if JSON parsing fails
        }
      }

      resolve({
        success: code === 0,
        code,
        stdout: cleanStdout,
        stderr: cleanStderr,
        data: parsedData,
      });
    });

    child.on('error', err => {
      clearTimeout(timer);
      resolve({
        success: false,
        code: 1,
        stdout: '',
        stderr: `Failed to spawn lando: ${err.message}`,
      });
    });
  });
}

module.exports = {
  runLandoCommand,
  isDockerRunning,
  stripAnsi,
};
