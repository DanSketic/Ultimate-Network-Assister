import { fileURLToPath } from 'node:url';
/*
 * Finds controls that look interactive but are not wired to anything: buttons
 * with no onClick, inputs with no onChange, and handlers that are empty.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '') + '/src';

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

/** The opening tag of the element starting at `start`, brace-aware. */
function openingTag(src, start) {
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(start, j + 1);
  }
  return src.slice(start);
}

const findings = [];

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const rel = file.replace(/\\/g, '/').split('/src/')[1];

  for (const [tag, handler] of [
    ['button', 'onClick'],
    ['input', 'onChange|onClick'],
    ['textarea', 'onChange'],
    ['select', 'onChange'],
  ]) {
    const re = new RegExp(`<${tag}\\b`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const open = openingTag(src, m.index);
      if (new RegExp(handler).test(open)) continue;
      if (/type=["']submit["']/.test(open)) continue;
      if (/\bdisabled\b/.test(open) && !/disabled=\{/.test(open)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      findings.push(`${rel}:${line}  <${tag}> has no ${handler.split('|')[0]}`);
    }
  }

  // Handlers wired to nothing at all.
  for (const m of src.matchAll(/\bon[A-Z]\w+=\{\(\)\s*=>\s*\{\s*\}\}/g)) {
    const line = src.slice(0, m.index).split('\n').length;
    findings.push(`${rel}:${line}  empty handler ${m[0].slice(0, 30)}`);
  }
}

for (const f of findings) console.log('  ' + f);
console.log(`\ndead controls: ${findings.length}`);
