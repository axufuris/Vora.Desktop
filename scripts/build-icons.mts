import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconsLua } from './svgToAss.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const folder = join(root, 'src', 'player', 'icons');
const icons = readdirSync(folder)
    .filter(name => name.endsWith('.svg'))
    .sort()
    .map(name => ({ name: name.slice(0, -4), svg: readFileSync(join(folder, name), 'utf8') }));

writeFileSync(join(root, 'src', 'player', 'vora', 'icons.lua'), iconsLua(icons), 'utf8');
console.log(`Wrote ${icons.length} icons to src/player/vora/icons.lua`);
