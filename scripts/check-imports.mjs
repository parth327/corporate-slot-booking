#!/usr/bin/env node
/**
 * Static integrity check for a parallel-authored codebase.
 *
 * Walks every .js/.jsx source file under server/src and client/src and verifies:
 *   1. every relative import resolves to a file that actually exists
 *   2. every *named* import exists as a named export of the target module
 *   3. every default import targets a module that actually has a default export
 *   4. bare specifiers are declared in the matching package.json
 *
 * This is deliberately regex-based rather than AST-based so it has zero
 * dependencies and can run before anything is installed or built.
 *
 *   node scripts/check-imports.mjs
 *
 * Exits 1 when any problem is found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { name: 'server', dir: path.join(ROOT, 'server', 'src'), pkg: path.join(ROOT, 'server', 'package.json') },
  { name: 'client', dir: path.join(ROOT, 'client', 'src'), pkg: path.join(ROOT, 'client', 'package.json') },
];

const SOURCE_EXT = new Set(['.js', '.jsx', '.mjs']);
const RESOLVE_ORDER = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'crypto', 'dns',
  'events', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'perf_hooks',
  'process', 'querystring', 'readline', 'stream', 'string_decoder', 'timers',
  'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
]);

const problems = [];
const notes = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (SOURCE_EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments and string literals so we never match inside them. */
function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' ');
}

/** Parse the import statements of a module. */
function parseImports(src) {
  const code = stripNoise(src);
  const results = [];
  const re = /import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const [, clauseRaw, spec] = m;
    const entry = { spec, named: [], default: null, namespace: false, sideEffect: !clauseRaw };
    if (clauseRaw) {
      let clause = clauseRaw.trim();
      const braceStart = clause.indexOf('{');
      const braceEnd = clause.lastIndexOf('}');
      if (braceStart !== -1 && braceEnd > braceStart) {
        const inner = clause.slice(braceStart + 1, braceEnd);
        for (const piece of inner.split(',')) {
          const name = piece.trim().split(/\s+as\s+/)[0].trim();
          if (name && name !== 'default') entry.named.push(name);
          else if (name === 'default') entry.default = 'default';
        }
        clause = (clause.slice(0, braceStart) + clause.slice(braceEnd + 1)).replace(/,\s*$/, '').trim();
      }
      if (/\*\s+as\s+/.test(clause)) entry.namespace = true;
      else {
        const dflt = clause.replace(/,$/, '').trim();
        if (dflt && /^[A-Za-z_$][\w$]*$/.test(dflt)) entry.default = dflt;
      }
    }
    results.push(entry);
  }
  // `export ... from './x.js'` re-exports resolve the same way.
  const reExport = /export\s+(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = reExport.exec(code)) !== null) {
    results.push({ spec: m[1], named: [], default: null, namespace: true, sideEffect: false });
  }
  return results;
}

/** Collect the names a module exports. */
function parseExports(src) {
  const code = stripNoise(src);
  const named = new Set();
  let hasDefault = false;
  let starFrom = false;

  if (/export\s+default\s/.test(code)) hasDefault = true;
  if (/export\s+\*\s+from/.test(code)) starFrom = true;

  const decl = /export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = decl.exec(code)) !== null) named.add(m[1]);

  // Multiple declarators: export const a = 1, b = 2
  const multi = /export\s+(?:const|let|var)\s+([^;=]*?=[\s\S]*?);?$/gm;
  while ((m = multi.exec(code)) !== null) {
    const names = m[1].match(/(^|,)\s*([A-Za-z_$][\w$]*)\s*=/g) || [];
    for (const n of names) named.add(n.replace(/[,=\s]/g, ''));
  }

  const braced = /export\s*\{([\s\S]*?)\}/g;
  while ((m = braced.exec(code)) !== null) {
    for (const piece of m[1].split(',')) {
      const parts = piece.trim().split(/\s+as\s+/);
      const exported = (parts[1] || parts[0] || '').trim();
      if (!exported) continue;
      if (exported === 'default') hasDefault = true;
      else named.add(exported);
    }
  }
  return { named, hasDefault, starFrom };
}

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const suffix of RESOLVE_ORDER) {
    const candidate = base + suffix;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const exportCache = new Map();
function exportsOf(file) {
  if (!exportCache.has(file)) {
    exportCache.set(file, parseExports(fs.readFileSync(file, 'utf8')));
  }
  return exportCache.get(file);
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

for (const target of TARGETS) {
  const files = walk(target.dir);
  if (!files.length) {
    notes.push(`${target.name}: no source files found under ${rel(target.dir)}`);
    continue;
  }

  let deps = new Set();
  if (fs.existsSync(target.pkg)) {
    const pkg = JSON.parse(fs.readFileSync(target.pkg, 'utf8'));
    deps = new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ]);
  }

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const imp of parseImports(src)) {
      const { spec } = imp;

      // Non-code assets (CSS etc.) only need to exist.
      if (/\.(css|svg|png|jpe?g|webp|json)$/.test(spec)) {
        if (spec.startsWith('.')) {
          const p = path.resolve(path.dirname(file), spec);
          if (!fs.existsSync(p)) problems.push(`${rel(file)} -> missing asset '${spec}'`);
        }
        continue;
      }

      if (spec.startsWith('.')) {
        const resolved = resolveRelative(file, spec);
        if (!resolved) {
          problems.push(`${rel(file)} -> unresolved import '${spec}'`);
          continue;
        }
        if (target.name === 'server' && !/\.(js|mjs)$/.test(spec)) {
          problems.push(`${rel(file)} -> ESM needs an explicit extension: '${spec}'`);
        }
        const ex = exportsOf(resolved);
        if (imp.default && imp.default !== 'default' && !ex.hasDefault) {
          problems.push(`${rel(file)} -> '${spec}' has no default export (imported as ${imp.default})`);
        }
        for (const name of imp.named) {
          if (!ex.named.has(name) && !ex.starFrom) {
            problems.push(`${rel(file)} -> '${spec}' does not export '${name}'`);
          }
        }
        continue;
      }

      // Bare specifier
      const pkgName = spec.startsWith('@')
        ? spec.split('/').slice(0, 2).join('/')
        : spec.split('/')[0];
      const builtin = pkgName.replace(/^node:/, '');
      if (NODE_BUILTINS.has(builtin)) continue;
      if (!deps.has(pkgName)) {
        problems.push(`${rel(file)} -> '${spec}' is not a declared ${target.name} dependency`);
      }
    }
  }
  notes.push(`${target.name}: scanned ${files.length} files`);
}

for (const n of notes) console.log(`  ${n}`);

if (problems.length) {
  console.error(`\n${problems.length} import problem(s):\n`);
  for (const p of [...new Set(problems)].sort()) console.error(`  x  ${p}`);
  process.exit(1);
}
console.log('\n  OK - every import resolves and every named import exists.\n');
