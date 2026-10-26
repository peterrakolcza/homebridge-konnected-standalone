import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../config.schema.json', import.meta.url), 'utf8'));

test('settings match package.json and config.schema.json', () => {
  assert.equal(PLUGIN_NAME, pkg.name);
  assert.equal(PLATFORM_NAME, schema.pluginAlias);
  assert.equal(PLATFORM_NAME, 'KonnectedStandalone');
});
