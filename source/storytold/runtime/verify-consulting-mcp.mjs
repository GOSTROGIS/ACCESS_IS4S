import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2]);
const launch = process.argv[3] ? [path.resolve(process.argv[3]), '--offline'] :
  [path.join(root, 'mcp', 'server.mjs'), '--local', '--root', path.join(root, 'site'), '--offline'];
const sdk = path.join(root, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm', 'client');
const { Client } = await import(pathToFileURL(path.join(sdk, 'index.js')));
const { StdioClientTransport } = await import(pathToFileURL(path.join(sdk, 'stdio.js')));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: launch,
  stderr: 'pipe',
});
const client = new Client({ name: 'installed-consulting-test', version: '1.0.0' });
await client.connect(transport);
try {
  assert.equal(client.getServerVersion().name, 'landbraid-atlas');
  const { tools } = await client.listTools();
  assert.equal(tools.length, 7);
  const point = { lat: 49.888, lon: -119.496 };
  const calls = {
    search_catalog: { query: 'building permits', jurisdiction: 'BC', limit: 3 },
    get_source: { id: 'ca-osm-food-bc' },
    list_datasets: { query: 'permits', limit: 3 },
    query_dataset: { dataset: 'ca/ab/calgary/contractor-licences', limit: 2 },
    area_profile: { area: 'Kelowna', geography: 'ca-csd-bc', topics: 'restaurants', max_metrics: 10 },
    features_near: { ...point, radius_m: 250, source_ids: ['ca-osm-food-bc'], max_features: 3 },
    distance: { a: point, b: { lat: 49.2827, lon: -123.1207 } },
  };
  for (const tool of tools) {
    const result = await client.callTool({ name: tool.name, arguments: calls[tool.name] });
    assert.notEqual(result.isError, true, `${tool.name}: ${result.content[0].text}`);
    const body = JSON.parse(result.content[0].text);
    assert.ok(body.provenance?.retrievedAt, tool.name);
    assert.ok(typeof body.provenance.restricted === 'boolean', tool.name);
    console.log(`PASS installed stdio ${tool.name}`);
  }
} finally {
  await client.close();
}
