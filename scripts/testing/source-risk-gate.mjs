import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const scanRoots = [
  'apps/backend/src',
  'apps/admin-web/app',
  'apps/rider-app/app',
  'apps/rider-app/lib',
  'apps/driver-app/app',
  'apps/driver-app/lib',
  'packages/api/src',
  'packages/domain/src',
  'packages/i18n/src',
  'packages/ui/src',
];

const ignoredSegments = new Set([
  '.expo',
  '.next',
  'coverage',
  'dist',
  'fixtures',
  'node_modules',
]);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const rules = [
  {
    id: 'no-empty-catch',
    pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/u,
    message: 'Empty catch blocks hide failures and make recovery untestable.',
  },
  {
    id: 'no-ui-noop-actions',
    pattern: /onPress=\{\s*(?:\(\)\s*=>\s*\{\s*\}|undefined)\s*\}|href=["']#["']/u,
    message: 'Visible actions must not be wired to no-op handlers or placeholder links.',
  },
  {
    id: 'no-raw-console-payloads',
    pattern: /\bconsole\.(?:log|debug|info|warn|error)\s*\([^)]*,/u,
    message: 'Runtime logs must not print raw objects, payloads or serialized backend data.',
    allow: ['apps/backend/src/main.ts'],
  },
  {
    id: 'no-runtime-test-double-names',
    pattern: /\b(?:mock|fake|fixture|seed-demo|demo-activity)\b/iu,
    message: 'Runtime code must not depend on test/demo data paths or names.',
    allow: [
      'apps/backend/src/modules/health/health.service.ts',
      'apps/backend/src/modules/payments/payment-fixture-manifest.ts',
      'apps/admin-web/app/page.tsx',
    ],
  },
  {
    id: 'no-typescript-suppression',
    pattern: /@ts-ignore|@ts-expect-error/u,
    message: 'TypeScript suppressions require an explicit reviewed exception.',
  },
];

const findings = [];

for (const scanRoot of scanRoots) {
  walk(join(root, scanRoot));
}

if (findings.length > 0) {
  console.error('Source risk gate failed:');
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`,
    );
  }
  process.exit(1);
}

console.log('[ok] Source risk gate passed.');

function walk(directory) {
  let entries;

  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const relativePath = normalizePath(relative(root, fullPath));
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (!ignoredSegments.has(entry)) {
        walk(fullPath);
      }
      continue;
    }

    if (!sourceExtensions.has(extensionOf(entry)) || isTestSource(relativePath)) {
      continue;
    }

    auditFile(relativePath, readFileSync(fullPath, 'utf8'));
  }
}

function auditFile(file, contents) {
  const lines = contents.split(/\r?\n/u);

  for (const rule of rules) {
    if (rule.allow?.includes(file)) {
      continue;
    }

    for (const [index, line] of lines.entries()) {
      if (isCommentOnlyLine(line)) {
        continue;
      }

      if (rule.pattern.test(line)) {
        findings.push({
          file,
          line: index + 1,
          rule: rule.id,
          message: rule.message,
        });
      }
    }
  }
}

function extensionOf(fileName) {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index);
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function isTestSource(path) {
  return (
    path.includes('/test/') ||
    path.endsWith('.spec.ts') ||
    path.endsWith('.spec.tsx') ||
    path.endsWith('.test.ts') ||
    path.endsWith('.test.tsx')
  );
}

function isCommentOnlyLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}
