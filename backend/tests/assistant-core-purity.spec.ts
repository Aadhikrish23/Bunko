import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// T-094. The assistant is a reusable core (copied from the RoninArc AI module)
// plus Bunko's books pack in domains/books. Core files reach the pack only
// through domainPack(), and never import Bunko's own modules, so the core can
// be updated from upstream and the pack swapped. Only the wiring files may
// import the pack or the app. Pure: needs no server or database.
const AI_DIR = path.resolve(__dirname, '../src/modules/assistant');
const WIRING = new Set(['aiController.ts', 'aiRoutes.ts', 'index.ts']);
// Packages the core may use; anything else (Prisma, Bunko's config...) is app coupling.
const ALLOWED_PACKAGES = new Set(['axios', 'express', 'fastest-levenshtein', 'crypto', 'fs', 'path', 'async_hooks']);

function coreFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.relative(AI_DIR, full) !== 'domains') coreFiles(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
}

const rel = (file: string) => path.relative(AI_DIR, file).replace(/\\/g, '/');

test.describe('assistant core purity (T-094)', () => {
  test('core files never import the books pack, Bunko modules, or unexpected packages', () => {
    const files = coreFiles(AI_DIR).filter((f) => !WIRING.has(rel(f)));
    expect(files.length).toBeGreaterThan(100);

    const violations: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) {
          if (!ALLOWED_PACKAGES.has(spec.split('/')[0]!)) violations.push(`${rel(file)} -> ${spec}`);
          continue;
        }
        const target = rel(path.resolve(path.dirname(file), spec));
        if (target.startsWith('..') || target === 'domains' || target.startsWith('domains/')) {
          violations.push(`${rel(file)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('only the composition root selects a pack', () => {
    const selecting = coreFiles(AI_DIR)
      .filter((f) => /setDomainPack\(/.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => f !== 'domain/activeDomain.ts');
    expect(selecting).toEqual(['aiController.ts']);
  });
});
