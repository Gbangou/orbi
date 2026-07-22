import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();

const scanRoots = ['apps/backend/src', 'apps/rider-app/app', 'apps/rider-app/lib', 'apps/driver-app/app', 'apps/driver-app/lib', 'packages/api/src', 'packages/domain/src', 'packages/ui/src'];

const ignoredSegments = new Set(['android', 'build', 'dist', 'node_modules', '.expo']);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const rules = [
  {
    id: 'no-console-in-runtime',
    pattern: /\bconsole\.(log|debug|info|warn|error)\s*\(/,
    message: 'Runtime code must use structured reporting/logger paths, not console.*.',
    allow: [
      'apps/backend/src/main.ts',
    ],
  },
  {
    id: 'no-ts-ignore',
    pattern: /@ts-ignore|@ts-expect-error/,
    message: 'TypeScript suppressions must not enter runtime source without an explicit reviewed exception.',
  },
  {
    id: 'no-mobile-localstorage-token',
    pattern: /\b(localStorage|AsyncStorage)\b/,
    message: 'Mobile tokens and PII must not use localStorage/AsyncStorage; use SecureStore or bounded sessionStorage on web.',
    allow: [
      'apps/rider-app/lib/session-storage.ts',
      'apps/driver-app/lib/session-storage.ts',
    ],
  },
  {
    id: 'no-hardcoded-bearer-secret',
    pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/,
    message: 'Bearer tokens must never be hardcoded in runtime source.',
  },
  {
    id: 'no-password-in-runtime-copy',
    pattern: /\b(password|secret|token)\b\s*[:=]\s*['"`][^'"`]{8,}/i,
    message: 'Runtime source must not contain concrete passwords or password-like secrets.',
    allow: [
      'apps/backend/src/config/environment.validation.ts',
    ],
  },
];

const findings = [];

for (const scanRoot of scanRoots) {
  walk(join(root, scanRoot));
}

if (findings.length > 0) {
  console.error('Security/privacy source audit failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);
  }
  process.exit(1);
}

console.log('[ok] Security/privacy source audit passed.');

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

    if (!sourceExtensions.has(extensionOf(entry))) {
      continue;
    }

    if (isTestSource(relativePath)) {
      continue;
    }

    auditFile(relativePath, readFileSync(fullPath, 'utf8'));
  }
}

function auditFile(file, contents) {
  const lines = contents.split(/\r?\n/);

  for (const rule of rules) {
    if (rule.allow?.includes(file)) {
      continue;
    }

    for (const [index, line] of lines.entries()) {
      if (isCommentOnlyLine(line)) {
        continue;
      }

      if (rule.id === 'no-password-in-runtime-copy' && file.includes('/i18n/')) {
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
