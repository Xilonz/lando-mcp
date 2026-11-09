'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Check if lando CLI is available in PATH
function checkLandoAvailable() {
  if (process.env.TEST_CI === '1' || process.env.TEST_CI === 'true') {
    return false;
  }
  try {
    const res = spawnSync('lando', ['version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch (_) {
    return false;
  }
}

async function testMcpServer() {
  const hasLando = checkLandoAvailable();
  const repoRoot = path.resolve(__dirname, '..');
  const binPath = path.join(repoRoot, 'bin', 'lando-mcp.js');

  console.log(`--- Starting MCP Server Test (${hasLando ? 'via "lando mcp"' : 'via standalone node runner (CI mode)'}) ---`);

  // Create a temporary test Lando project fixture
  const fixtureDir = path.join(os.tmpdir(), 'lando-mcp-test-fixture');
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, '.lando.yml'),
    'name: test-fixture-app\nrecipe: wordpress\ntooling:\n  my-custom-cli:\n    service: appserver\n    description: Custom test tooling command\n'
  );

  const command = hasLando ? 'lando' : process.execPath;
  const args = hasLando ? ['mcp', '--project', fixtureDir] : [binPath, '--project', fixtureDir];

  const child = spawn(command, args, {
    cwd: fixtureDir,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let buffer = '';

  function send(msg) {
    const json = JSON.stringify(msg);
    child.stdin.write(json + '\n');
  }

  function waitForResponse(id) {
    return new Promise((resolve, reject) => {
      const onData = chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep last incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.id === id) {
              child.stdout.off('data', onData);
              return resolve(parsed);
            }
          } catch (_) {
            // Not JSON or partial
          }
        }
      };

      child.stdout.on('data', onData);

      setTimeout(() => {
        child.stdout.off('data', onData);
        reject(new Error(`Timeout waiting for response to request ${id}`));
      }, 10000);
    });
  }

  try {
    // 1. Send initialize
    console.log('[Test] Sending initialize request...');
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    });

    const initRes = await waitForResponse(1);
    console.log('[Test] Initialize response received:', initRes.result.serverInfo);

    // 2. Send initialized notification
    send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // 3. Request tools/list
    console.log('[Test] Requesting tools/list...');
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    const listRes = await waitForResponse(2);
    const tools = listRes.result.tools;
    console.log(`[Test] Received ${tools.length} registered tools:`);
    console.log(tools.slice(0, 5).map(t => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n') + `\n  ... and ${tools.length - 5} more`);

    // Verify key core tools exist
    const toolNames = new Set(tools.map(t => t.name));
    for (const expected of ['lando_list', 'lando_start', 'lando_stop', 'lando_exec', 'lando_discover_tools']) {
      if (!toolNames.has(expected)) {
        throw new Error(`Expected core tool missing: ${expected}`);
      }
    }

    // 4. Test dynamic tool discovery on fixture
    console.log('[Test] Calling lando_discover_tools on test fixture...');
    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'lando_discover_tools',
        arguments: {
          path: fixtureDir,
        },
      },
    });

    const callRes = await waitForResponse(3);
    const text = callRes.result.content[0].text;
    const parsedDiscovery = JSON.parse(text);
    console.log(`[Test] Discovery succeeded for app: ${parsedDiscovery.name}, found tools:`, parsedDiscovery.tools.map(t => t.name));
    
    if (!parsedDiscovery.tools.some(t => t.name === 'my-custom-cli')) {
      throw new Error('Expected custom tool "my-custom-cli" was not discovered in fixture');
    }

    if (hasLando) {
      // 5. Test tool call: lando_version
      console.log('[Test] Calling lando_version...');
      send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'lando_version',
          arguments: {},
        },
      });

      const versionRes = await waitForResponse(4);
      console.log(`[Test] Version result: ${versionRes.result.content[0].text.trim()}`);

      // 6. Test tool call: lando_recipes
      console.log('[Test] Calling lando_recipes...');
      send({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'lando_recipes',
          arguments: {},
        },
      });

      const recipesRes = await waitForResponse(5);
      const recipesList = JSON.parse(recipesRes.result.content[0].text);
      console.log(`[Test] Recipes count: ${recipesList.length}, sample: ${recipesList[0].name}`);

      // 7. Test tool call: lando_init (in /tmp/mcp-init-test)
      console.log('[Test] Calling lando_init in /tmp/mcp-init-test...');
      const initTestDir = path.join(os.tmpdir(), 'mcp-init-test');
      fs.mkdirSync(initTestDir, { recursive: true });

      send({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'lando_init',
          arguments: {
            path: initTestDir,
            name: 'mcp-test-app',
            recipe: 'wordpress',
            webroot: 'wordpress',
          },
        },
      });

      const initToolRes = await waitForResponse(6);
      console.log('[Test] lando_init call response:', initToolRes.result.content[0].text.includes('Your app has been initialized!') ? 'SUCCESS' : 'FAILED');
      fs.rmSync(initTestDir, { recursive: true, force: true });
    } else {
      console.log('[Test] Skipping live Lando CLI executions in CI environment (Lando not installed).');
    }

    console.log('\n✅ ALL MCP TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    child.stdin.end();
    child.kill('SIGTERM');
  }
}

testMcpServer();
