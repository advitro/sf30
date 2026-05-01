/**
 * Build Smoke Test — SF30 V2.0
 *
 * Verifies the production build output is valid and complete.
 * No browser required — pure file-system inspection.
 */

import fs from 'fs';
import path from 'path';

describe('Build Smoke Test', () => {
  const DIST_DIR = path.resolve(__dirname, '../../dist');

  function collectFilesByExtension(dir: string, ext: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectFilesByExtension(fullPath, ext));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  test('dist directory exists', () => {
    expect(fs.existsSync(DIST_DIR)).toBe(true);
    expect(fs.statSync(DIST_DIR).isDirectory()).toBe(true);
  });

  test('manifest.json exists and is valid', () => {
    const manifestPath = path.join(DIST_DIR, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBeTruthy();
    expect(manifest.version).toBeTruthy();
  });

  test('required output files exist', () => {
    expect(fs.existsSync(path.join(DIST_DIR, 'src/background/index.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src/content/isolated/index.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src/content/main/index.js'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src/popup/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(DIST_DIR, 'src/popup/index.js'))).toBe(true);
  });

  test('no source maps in production build', () => {
    const jsFiles = collectFilesByExtension(DIST_DIR, '.js');
    for (const file of jsFiles) {
      expect(file.endsWith('.js')).toBe(true);
      expect(file.endsWith('.js.map')).toBe(false);
    }
    // Also check that no .map files exist anywhere in dist
    const mapFiles = collectFilesByExtension(DIST_DIR, '.map');
    expect(mapFiles).toHaveLength(0);
  });

  test('CSP is present in manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.content_security_policy).toBeDefined();
    expect(manifest.content_security_policy.extension_pages).toContain('connect-src');
  });

  test('no console.log or debugger in built JS', () => {
    const jsFiles = collectFilesByExtension(DIST_DIR, '.js');
    expect(jsFiles.length).toBeGreaterThan(0);
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/console\.log\s*\(/);
      expect(content).not.toMatch(/debugger/);
    }
  });

  test('host_permissions does not include license server (serverless)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf-8'));
    expect(manifest.host_permissions).not.toContain('https://license.sf30.app/*');
    expect(manifest.host_permissions).toContain('https://atoz-apps.amazon.work/*');
  });
});
