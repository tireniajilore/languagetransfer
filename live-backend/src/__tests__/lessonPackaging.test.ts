import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The lesson conductor reads authored lesson JSON via fs at runtime
 * (conductor.sourceDir), so tsc never copies them into dist. The
 * Dockerfile's runtime stage must ship them explicitly, otherwise the
 * deployed service 503s on every course endpoint while CI stays green.
 */
describe('lesson data deployment packaging', () => {
  const pkgRoot = join(__dirname, '..', '..');

  it('ships every authored lesson JSON', () => {
    const dataDir = join(pkgRoot, 'src', 'lessons', 'data');
    const files = readdirSync(dataDir).filter((f) => /^lesson-\d{2}\.json$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(() => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))).not.toThrow();
    }
  });

  it('Dockerfile runtime stage copies src/lessons/data', () => {
    const dockerfile = readFileSync(join(pkgRoot, 'Dockerfile'), 'utf8');
    const runtimeStage = dockerfile.split('# ---- runtime ----')[1] ?? '';
    expect(existsSync(join(pkgRoot, 'Dockerfile'))).toBe(true);
    expect(runtimeStage).toMatch(/COPY[^\n]*src\/lessons\/data[^\n]*\.\/src\/lessons\/data/);
  });
});
