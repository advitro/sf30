#!/usr/bin/env node
/**
 * SF30 License Server — Deploy Readiness Checker
 *
 * Run this to see what's left before you can deploy to Vercel.
 *   node scripts/check-deploy-readiness.js
 *   npm run deploy:check
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const checks = [];

// 1. Vercel project linked?
const vercelProjectPath = join(root, '.vercel', 'project.json');
if (existsSync(vercelProjectPath)) {
  try {
    const project = JSON.parse(readFileSync(vercelProjectPath, 'utf-8'));
    if (project.projectId && project.orgId) {
      checks.push({ ok: true, text: 'Vercel project linked', detail: `projectId: ${project.projectId.slice(0, 8)}...` });
    } else {
      checks.push({ ok: false, text: 'Vercel project linked', detail: '.vercel/project.json exists but is missing projectId or orgId' });
    }
  } catch {
    checks.push({ ok: false, text: 'Vercel project linked', detail: '.vercel/project.json is corrupted' });
  }
} else {
  checks.push({ ok: false, text: 'Vercel project linked', detail: 'Run: npm run vercel:link' });
}

// 2. vercel.json present?
if (existsSync(join(root, 'vercel.json'))) {
  checks.push({ ok: true, text: 'vercel.json present', detail: 'Routing config is ready' });
} else {
  checks.push({ ok: false, text: 'vercel.json present', detail: 'Missing vercel.json — something went wrong during setup' });
}

// 3. Postgres driver installed?
try {
  await import('@neondatabase/serverless');
  checks.push({ ok: true, text: 'Postgres driver installed', detail: '@neondatabase/serverless is ready' });
} catch {
  checks.push({ ok: false, text: 'Postgres driver installed', detail: 'Run: npm install' });
}

// 4. GitHub workflow present?
const workflowPath = join(root, '..', '.github', 'workflows', 'deploy-license-server.yml');
if (existsSync(workflowPath)) {
  checks.push({ ok: true, text: 'GitHub Actions workflow', detail: '.github/workflows/deploy-license-server.yml exists' });
} else {
  checks.push({ ok: false, text: 'GitHub Actions workflow', detail: 'Missing deploy workflow — something went wrong during setup' });
}

// Print results
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  SF30 License Server — Deploy Readiness Check');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

let allOk = true;
for (const c of checks) {
  const icon = c.ok ? '✅' : '❌';
  console.log(`  ${icon}  ${c.text}`);
  console.log(`      ${c.detail}`);
  console.log('');
  if (!c.ok) allOk = false;
}

if (allOk) {
  console.log('🚀  Local setup looks good! You are ready to deploy.');
  console.log('');
  console.log('    Next: add a Postgres database in the Vercel dashboard,');
  console.log('    set API_TOKEN env var, add GitHub secrets, and push.');
} else {
  console.log('⚠️   Some checks failed. Fix them above, then run this again.');
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Print checklist
console.log('YOUR TURN — Steps only YOU can do (requires browser login):');
console.log('');
console.log('  1. Vercel Dashboard (https://vercel.com/dashboard)');
console.log('     → Select your project');
console.log('     → Storage → Connect a Postgres database (Neon)');
console.log('     → Project Settings → Environment Variables');
console.log('       • API_TOKEN    = <generate with: openssl rand -base64 32>');
console.log('       • DEFAULT_DAYS = 30');
console.log('');
console.log('  2. GitHub Repo → Settings → Secrets and variables → Actions');
console.log('     → New repository secret');
console.log('       • VERCEL_TOKEN    = <create at vercel.com/account/tokens>');
console.log('       • VERCEL_ORG_ID   = <from license-server/.vercel/project.json>');
console.log('       • VERCEL_PROJECT_ID = <from license-server/.vercel/project.json>');
console.log('');
console.log('  3. Push to main branch — GitHub Actions will deploy automatically.');
console.log('');
console.log('  4. Update your extension to use the deployed Vercel URL.');
console.log('');
