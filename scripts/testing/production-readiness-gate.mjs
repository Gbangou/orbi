import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const skipFlags = new Set(process.argv.slice(2));

function isSkipped(flag) {
  return skipFlags.has(flag) || skipFlags.has(flag.replace('--', '-'));
}

function writeSection(title) {
  process.stdout.write(`\n== ${title} ==\n`);
}

function runGate(name, command, args) {
  writeSection(name);
  process.stdout.write(`> ${command} ${args.join(' ')}\n`);
  const startedAt = performance.now();
  const invocation = resolveInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Production readiness gate failed at '${name}' with exit code ${result.status}.`,
    );
  }

  const durationSeconds = (performance.now() - startedAt) / 1000;
  process.stdout.write(`[ok] ${name} passed in ${durationSeconds.toFixed(1)}s\n`);
}

function runSecretHygieneGate() {
  writeSection('Secret hygiene');
  const trackedFiles = collectTrackedFiles();
  const forbiddenPathPatterns = [
    /\.(pem|p12|pfx|key)$/iu,
  ];
  const forbiddenContentPatterns = [
    /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/u,
    /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/u,
    /FLWSECK-[A-Za-z0-9_-]{16,}/u,
    /CINETPAY[_-]?(?:API|SECRET)[_-]?KEY\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/iu,
  ];
  const trackedEnvFiles = trackedFiles.filter(
    (file) => isEnvFile(file) && !isExampleEnvFile(file),
  );
  const forbiddenPaths = trackedFiles.filter((file) =>
    forbiddenPathPatterns.some((pattern) => pattern.test(file)),
  );
  const forbiddenContent = [];

  for (const file of trackedFiles) {
    if (trackedEnvFiles.includes(file)) {
      continue;
    }

    if (isExampleEnvFile(file)) {
      continue;
    }

    if (
      file.endsWith('.png') ||
      file.endsWith('.jpg') ||
      file.endsWith('.jpeg') ||
      file.endsWith('.pdf')
    ) {
      continue;
    }

    let source = '';

    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    if (
      forbiddenContentPatterns.some((pattern) => pattern.test(source))
    ) {
      forbiddenContent.push(file);
    }
  }

  if (trackedEnvFiles.length || forbiddenPaths.length || forbiddenContent.length) {
    const details = [
      ...trackedEnvFiles.map((file) => `tracked runtime env file: ${file}`),
      ...forbiddenPaths.map((file) => `tracked secret-like path: ${file}`),
      ...forbiddenContent.map((file) => `secret-like content: ${file}`),
    ].join('\n');

    throw new Error(`Secret hygiene gate failed:\n${details}`);
  }

  process.stdout.write(
    '[ok] No private-key/certificate/provider-secret patterns found.\n',
  );
}

function collectTrackedFiles() {
  const result = spawnSync('git', ['ls-files'], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error('Could not list tracked files for secret hygiene gate.');
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean);
}

function isEnvFile(file) {
  const name = file.split('/').pop() ?? file;
  return name === '.env' || name.startsWith('.env.');
}

function isExampleEnvFile(file) {
  return file.endsWith('.env.example') || file.endsWith('/.env.example');
}

function collectWorkspaceFiles(directory) {
  const ignoredDirectories = new Set([
    '.git',
    '.next',
    '.turbo',
    '.expo',
    'coverage',
    'dist',
    'logs',
    'node_modules',
  ]);
  const files = [];

  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const path = directory === '.' ? entry : `${directory}/${entry}`;
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...collectWorkspaceFiles(path));
      continue;
    }

    if (stat.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function resolveInvocation(command, args) {
  if (process.platform === 'win32' && command === 'pnpm') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', ['pnpm', ...args].map(quoteWindowsArg).join(' ')],
    };
  }

  return { command, args };
}

function quoteWindowsArg(value) {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/gu, '\\"')}"`;
}

process.stdout.write('Orbi production readiness gate\n');
process.stdout.write(`SkipSecretHygiene:    ${isSkipped('--skip-secret-hygiene')}\n`);
process.stdout.write(`SkipAudit:            ${isSkipped('--skip-audit')}\n`);
process.stdout.write(`SkipPrisma:           ${isSkipped('--skip-prisma')}\n`);
process.stdout.write(`SkipBackendReadiness: ${isSkipped('--skip-backend-readiness')}\n`);
process.stdout.write(`SkipPaymentFixtures:  ${isSkipped('--skip-payment-fixtures')}\n`);
process.stdout.write(`SkipAdminSmoke:       ${isSkipped('--skip-admin-smoke')}\n`);
process.stdout.write(`SkipMobileSmoke:      ${isSkipped('--skip-mobile-smoke')}\n`);
process.stdout.write(`SkipTypecheck:        ${isSkipped('--skip-typecheck')}\n`);

try {
  runGate('Whitespace diff check', 'git', ['diff', '--check']);

  if (!isSkipped('--skip-secret-hygiene')) {
    runSecretHygieneGate();
  }

  if (!isSkipped('--skip-audit')) {
    runGate('SCA dependency audit', 'pnpm', [
      'audit',
      '--audit-level',
      'moderate',
      '--ignore-registry-errors',
    ]);
  }

  if (!isSkipped('--skip-prisma')) {
    runGate('Prisma schema validation', 'pnpm', [
      '--filter',
      'backend',
      'exec',
      'prisma',
      'validate',
    ]);
  }

  if (!isSkipped('--skip-backend-readiness')) {
    runGate('Backend production readiness specs', 'pnpm', [
      '--filter',
      'backend',
      'test',
      'environment.validation',
      'health.service',
      'configurable-rate-limit.store',
      'configurable-realtime.transport',
      'mobile-error-collector',
      '--runInBand',
    ]);
  }

  if (!isSkipped('--skip-payment-fixtures')) {
    runGate('Payment provider fixture evidence', 'pnpm', [
      'test:payments:fixtures',
    ]);
  }

  if (!isSkipped('--skip-admin-smoke')) {
    runGate('Admin smoke tests', 'pnpm', ['test:admin:smoke']);
  }

  if (!isSkipped('--skip-mobile-smoke')) {
    runGate('Mobile shared test helpers typecheck', 'pnpm', [
      'test:mobile:helpers',
    ]);

    runGate('Mobile smoke tests', 'pnpm', ['test:mobile:smoke']);
  }

  if (!isSkipped('--skip-typecheck')) {
    runGate('Workspace typecheck and builds', 'pnpm', ['typecheck']);
  }

  writeSection('Result');
  process.stdout.write('[ok] Production readiness gate completed.\n');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n[failed] ${message}\n`);
  process.exit(1);
}
