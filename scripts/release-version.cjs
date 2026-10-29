'use strict';

const fs = require('node:fs');

function parseReleaseVersion(input) {
  const match = /^v?(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(input || '');
  if (!match) throw new Error('A versão deve ser vMAJOR.MINOR.PATCH, sem espaços ou comandos.');
  const [, major, minor, patch] = match;
  const versionName = `${major}.${minor}.${patch}`;
  const versionCode = Number(major) * 1000000 + Number(minor) * 1000 + Number(patch);
  if (versionCode < 1) throw new Error('A versão 0.0.0 não é válida para publicação.');
  return { tag: `v${versionName}`, versionName, versionCode };
}

if (require.main === module) {
  try {
    const input = process.env.GITHUB_REF_TYPE === 'tag'
      ? process.env.GITHUB_REF_NAME : process.env.KS_RELEASE_VERSION;
    const version = parseReleaseVersion(input);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT,
        `tag=${version.tag}\nversion_name=${version.versionName}\nversion_code=${version.versionCode}\n`);
    }
    console.log(JSON.stringify(version));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { parseReleaseVersion };
