import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installPromiseTry } from './polyfills.ts';
import type { PromiseTry } from './polyfills.ts';

const tryOf = (P: PromiseConstructor) => (P as PromiseConstructor & { try?: PromiseTry }).try;

// A Promise-like constructor without `try`, standing in for Node 22's Promise.
function bareConstructor(): PromiseConstructor {
  class Bare<T> extends Promise<T> {}
  Object.defineProperty(Bare, 'try', { value: undefined, configurable: true, writable: true });
  return Bare as unknown as PromiseConstructor;
}

test('installs Promise.try when missing', async () => {
  const P = bareConstructor();
  installPromiseTry(P);
  assert.equal(typeof tryOf(P), 'function');
  assert.equal(await tryOf(P)!(() => 42), 42);
  assert.equal(await tryOf(P)!((a: number, b: number) => a + b, 2, 3), 5);
  assert.equal(await tryOf(P)!(async () => 'async'), 'async');
});

test('a synchronous throw becomes a rejection', async () => {
  const P = bareConstructor();
  installPromiseTry(P);
  await assert.rejects(tryOf(P)!(() => {
    throw new Error('boom');
  }), /boom/);
});

test('leaves an existing Promise.try untouched', () => {
  const existing = () => Promise.resolve('native');
  const P = bareConstructor();
  Object.defineProperty(P, 'try', { value: existing, configurable: true, writable: true });
  installPromiseTry(P);
  assert.equal(tryOf(P), existing);
});

test('the global Promise has try after loading the plugin modules', async () => {
  await import('./panelConnection.ts');
  assert.equal(typeof tryOf(Promise), 'function');
});
