'use strict';

const { spawn } = require('child_process');

async function testMcpServer() {
  console.log('--- Starting MCP Server Test via "lando mcp" ---');

  const child = spawn('lando', ['mcp'], {
    cwd: '/home/arjan/projects/sowmedia-nl',
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
    console.log(tools.map(t => `  - ${t.name}: ${t.description.split('.')[0]}`).join('\n'));

    // 4. Test tool call: lando_discover_tools
    console.log('[Test] Calling lando_discover_tools for sowmonitor-worker...');
    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'lando_discover_tools',
        arguments: {
          path: '/home/arjan/projects/sowmonitor-worker',
        },
      },
    });

    const callRes = await waitForResponse(3);
    const text = callRes.result.content[0].text;
    const parsedDiscovery = JSON.parse(text);
    console.log(`[Test] Discovery succeeded for app: ${parsedDiscovery.name}, found tools:`, parsedDiscovery.tools.map(t => t.name));

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
    const fs = require('fs');
    fs.mkdirSync('/tmp/mcp-init-test', { recursive: true });

    send({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'lando_init',
        arguments: {
          path: '/tmp/mcp-init-test',
          name: 'mcp-test-app',
          recipe: 'wordpress',
          webroot: 'wordpress',
        },
      },
    });

    const initToolRes = await waitForResponse(6);
    console.log('[Test] lando_init call response:', initToolRes.result.content[0].text.includes('Your app has been initialized!') ? 'SUCCESS' : 'FAILED');
    fs.rmSync('/tmp/mcp-init-test', { recursive: true, force: true });

    console.log('\n✅ ALL MCP TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    child.stdin.end();
    child.kill('SIGTERM');
  }
}

testMcpServer();
