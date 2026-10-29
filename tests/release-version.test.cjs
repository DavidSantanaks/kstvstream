'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseReleaseVersion } = require('../scripts/release-version.cjs');

test('versão de tag e versão manual produzem o mesmo código Android crescente', () => {
  assert.deepEqual(parseReleaseVersion('v1.2.3'), { tag: 'v1.2.3', versionName: '1.2.3', versionCode: 1002003 });
  assert.deepEqual(parseReleaseVersion('1.2.3'), parseReleaseVersion('v1.2.3'));
  assert.ok(parseReleaseVersion('1.3.0').versionCode > parseReleaseVersion('1.2.999').versionCode);
  assert.ok(parseReleaseVersion('2.0.0').versionCode > parseReleaseVersion('1.999.999').versionCode);
});

test('entrada de workflow não aceita shell, caminhos, quebra de linha ou versões ambíguas', () => {
  for (const value of ['', 'v0.0.0', 'v01.2.3', '1.2', '1.2.1000', '../1.2.3', 'v1.2.3\n', 'v1.2.3;echo unsafe', '$(echo unsafe)', 'v1.2.3-beta']) {
    assert.throws(() => parseReleaseVersion(value), value);
  }
});
