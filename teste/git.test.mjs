import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../nucleo/lib/git.mjs';

test('M5: git que morre por sinal sai com código 127, nunca 0 nem nulo', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-git-'));
  try {
    fs.writeFileSync(path.join(dir, 'git'), '#!/bin/sh\nkill -9 $$\n', { mode: 0o755 });
    const r = git(['status'], { cwd: dir, env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` } });
    assert.equal(r.codigo, 127);
    assert.match(r.erro, /morreu/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('M5: git ausente sai com 127', () => {
  const r = git(['status'], { env: { ...process.env, PATH: '' } });
  assert.equal(r.codigo, 127);
});
