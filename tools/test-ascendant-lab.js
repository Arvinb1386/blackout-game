'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'profiles.js'), 'utf8');
const ids = [...src.matchAll(/(x(?:10|[1-9])):\{tier:(\d+),form:'([^']+)'/g)];
function assert(name, ok, detail) { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' -> ' + detail : '')); if (!ok) process.exitCode = 1; }
assert('ascendant: ten new variants declared', ids.length === 10, ids.length);
assert('ascendant: tiers 11..20', ids.map(x => +x[2]).sort((a,b) => a-b).join(',') === '11,12,13,14,15,16,17,18,19,20');
assert('ascendant: ten unique forms', new Set(ids.map(x => x[3])).size === 10);
assert('ascendant: four phase pools', (src.match(/pools:\[null,/g) || []).length === 10 && src.includes("target = f <= 0.18 ? 4"));
assert('ascendant: difficulty scales past legacy tier ten', src.includes('b.labS = { hp: 1.98 + k * 0.17') && src.includes('d.tier < 11'));
assert('ascendant: signature attacks registered', ['timewell','cataclysm','annihilate','eclipse'].every(k => src.includes("addSig('" + k + "'")));
console.log('Done. exitCode=' + (process.exitCode || 0));
