'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const target = path.join(root, 'android-firetv/app/src/main/assets/www');

// public is canonical; copy without deleting unrelated local work.
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log('Interface web sincronizada com os assets Android.');
