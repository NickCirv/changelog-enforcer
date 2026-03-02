#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, chmodSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── ANSI colours ───────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
};
const red    = s => `${c.red}${s}${c.reset}`;
const green  = s => `${c.green}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const bold   = s => `${c.bold}${s}${c.reset}`;
const dim    = s => `${c.dim}${s}${c.reset}`;
const cyan   = s => `${c.cyan}${s}${c.reset}`;

// ─── Defaults ───────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  changelog: 'CHANGELOG.md',
  ignore: [
    'docs/', '*.test.js', '*.spec.js', '.github/', 'README.md',
    'CHANGELOG.md', '*.md', 'package-lock.json', 'yarn.lock',
    'pnpm-lock.yaml', '.gitignore', '.editorconfig', 'LICENSE',
    'test/', 'tests/', '__tests__/', 'jest.config.*', 'vitest.config.*',
  ],
  format: 'keepachangelog',
  require_version_bump: false,
  allow_bypass: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function findGitRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function loadConfig(root) {
  const cfgPath = join(root, '.changelog-enforcer.json');
  if (!existsSync(cfgPath)) return DEFAULT_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    console.warn(yellow('  Warning: Could not parse .changelog-enforcer.json, using defaults'));
    return DEFAULT_CONFIG;
  }
}

function isIgnored(filePath, ignore) {
  return ignore.some(pattern => {
    if (pattern.endsWith('/')) return filePath.startsWith(pattern) || filePath.includes('/' + pattern);
    if (pattern.startsWith('*.')) return filePath.endsWith(pattern.slice(1));
    return filePath === pattern || filePath.endsWith('/' + pattern);
  });
}

function parseDiffStat(root, files) {
  const stats = {};
  for (const f of files) {
    try {
      const out = execFileSync('git', ['diff', '--staged', '--numstat', '--', f], {
        encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (out) {
        const [added, removed] = out.split('\t');
        stats[f] = { added: parseInt(added) || 0, removed: parseInt(removed) || 0 };
      }
    } catch {
      stats[f] = { added: 0, removed: 0 };
    }
  }
  return stats;
}

function parseDiffStatRange(root, files, since) {
  const stats = {};
  for (const f of files) {
    try {
      const out = execFileSync('git', ['diff', '--numstat', `${since}..HEAD`, '--', f], {
        encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (out) {
        const [added, removed] = out.split('\t');
        stats[f] = { added: parseInt(added) || 0, removed: parseInt(removed) || 0 };
      }
    } catch {
      stats[f] = { added: 0, removed: 0 };
    }
  }
  return stats;
}

function getStagedFiles(root) {
  const out = git('-C', root, 'diff', '--staged', '--name-only');
  return out ? out.split('\n').filter(Boolean) : [];
}

function getChangedSince(root, since) {
  const out = git('-C', root, 'diff', '--name-only', `${since}..HEAD`);
  return out ? out.split('\n').filter(Boolean) : [];
}

function getPushedFiles(root) {
  // Files changed in commits that haven't been pushed yet
  const out = git('-C', root, 'diff', '--name-only', 'origin/HEAD..HEAD');
  if (out) return out.split('\n').filter(Boolean);
  // fallback to HEAD~1
  const out2 = git('-C', root, 'diff', '--name-only', 'HEAD~1..HEAD');
  return out2 ? out2.split('\n').filter(Boolean) : [];
}

function groupByArea(files) {
  const groups = {};
  for (const f of files) {
    const parts = f.split('/');
    const area = parts.length > 1 ? parts[0] : 'root';
    if (!groups[area]) groups[area] = [];
    groups[area].push(f);
  }
  return groups;
}

function suggestEntry(sourceFiles) {
  const groups = groupByArea(sourceFiles);
  const lines = ['## [Unreleased]', '### Changed'];
  for (const [area, files] of Object.entries(groups)) {
    if (files.length === 1) {
      lines.push(`- Updated ${files[0]}`);
    } else {
      lines.push(`- Modified ${area}/ (${files.length} files)`);
    }
  }
  return lines.join('\n');
}

function validateKeepAChangelog(content) {
  const errors = [];
  const hasUnreleased = /^## \[Unreleased\]/m.test(content);
  const hasVersion    = /^## \[\d+\.\d+\.\d+\]/m.test(content);
  if (!hasUnreleased && !hasVersion) {
    errors.push('Missing version header — expected ## [Unreleased] or ## [x.y.z]');
  }
  const validCategories = /###\s+(Added|Changed|Deprecated|Removed|Fixed|Security)/;
  const hasAnySection = /^###\s+/m.test(content);
  if (hasAnySection && !validCategories.test(content)) {
    errors.push('Invalid category — use Added, Changed, Deprecated, Removed, Fixed, or Security');
  }
  return errors;
}

function printHeader() {
  console.log('');
  console.log(bold(cyan('📋 Changelog Enforcer')));
  console.log(dim('─────────────────────'));
  console.log('');
}

function printBlocked(sourceFiles, changelogPath, stats) {
  console.log(red(bold('🔴 BLOCKED — CHANGELOG.md not updated')));
  console.log('');
  console.log(bold('Source changes detected:'));
  for (const f of sourceFiles) {
    const s = stats[f];
    const stat = s ? dim(`(+${s.added}, -${s.removed})`) : '';
    console.log(`  ${f.padEnd(40)} ${stat}`);
  }
  console.log('');
  console.log(`${bold('CHANGELOG.md:')} ${yellow('Not modified')}`);
  console.log('');
  const entry = suggestEntry(sourceFiles);
  console.log(bold('Suggested entry for CHANGELOG.md:'));
  console.log(dim('──────────────────────────────────'));
  console.log(cyan(entry));
  console.log(dim('──────────────────────────────────'));
  console.log('');
  console.log('Add the above to CHANGELOG.md, then commit again.');
  console.log(dim('Bypass once: npx changelog-enforcer --bypass'));
  console.log('');
}

function printPassed(sourceFiles, changelogPath) {
  console.log(green(bold('✅ PASSED — CHANGELOG.md is up to date')));
  console.log('');
  if (sourceFiles.length > 0) {
    console.log(bold('Source changes:'));
    for (const f of sourceFiles) console.log(`  ${dim('✓')} ${f}`);
    console.log('');
  }
  console.log(`${bold('CHANGELOG.md:')} ${green('Modified ✓')}`);
  console.log('');
}

function printClean() {
  console.log(green(bold('✅ No source changes detected')));
  console.log(dim('Nothing to enforce.'));
  console.log('');
}

// ─── Bypass file ─────────────────────────────────────────────────────────────
const BYPASS_FILE = '.changelog-bypass';

function hasBypass(root) {
  return existsSync(join(root, BYPASS_FILE));
}

function createBypass(root) {
  writeFileSync(join(root, BYPASS_FILE), new Date().toISOString() + '\n');
}

function clearBypass(root) {
  const p = join(root, BYPASS_FILE);
  if (existsSync(p)) unlinkSync(p);
}

// ─── Hook installation ────────────────────────────────────────────────────────
const HOOK_TEMPLATE = (hookType) => `#!/bin/sh
# Installed by changelog-enforcer
npx changelog-enforcer --hook-check ${hookType}
`;

function installHook(root, hookType) {
  const hooksDir = join(root, '.git', 'hooks');
  if (!existsSync(hooksDir)) {
    console.error(red('  Error: .git/hooks directory not found. Are you in a git repo?'));
    process.exit(1);
  }
  const hookPath = join(hooksDir, hookType);
  writeFileSync(hookPath, HOOK_TEMPLATE(hookType));
  chmodSync(hookPath, 0o755);
  console.log(green(`  ✓ Installed ${hookType} hook → .git/hooks/${hookType}`));
  console.log(dim(`    Run: npx changelog-enforcer --remove-hook to uninstall`));
  console.log('');
}

function removeHook(root, hookType = 'pre-commit') {
  const types = hookType === 'all' ? ['pre-commit', 'pre-push'] : [hookType];
  for (const t of types) {
    const p = join(root, '.git', 'hooks', t);
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      if (content.includes('changelog-enforcer')) {
        unlinkSync(p);
        console.log(green(`  ✓ Removed ${t} hook`));
      } else {
        console.log(yellow(`  Warning: ${t} hook exists but wasn't installed by changelog-enforcer — skipping`));
      }
    } else {
      console.log(dim(`  No ${t} hook found`));
    }
  }
  console.log('');
}

// ─── Core check ──────────────────────────────────────────────────────────────
function runCheck({ root, config, files, isHook = false, hookType = null }) {
  const changelogFile = config.changelog;
  const changelogChanged = files.includes(changelogFile);
  const sourceFiles = files.filter(f => !isIgnored(f, config.ignore));

  if (sourceFiles.length === 0) {
    if (!isHook) { printHeader(); printClean(); }
    return 0;
  }

  if (changelogChanged) {
    if (!isHook) {
      printHeader();
      printPassed(sourceFiles, changelogFile);
      if (config.format === 'keepachangelog') {
        const changelogPath = join(root, changelogFile);
        if (existsSync(changelogPath)) {
          const errors = validateKeepAChangelog(readFileSync(changelogPath, 'utf8'));
          if (errors.length > 0) {
            console.log(yellow(bold('⚠️  CHANGELOG format warnings:')));
            errors.forEach(e => console.log(`  ${yellow('→')} ${e}`));
            console.log('');
          } else {
            console.log(dim('  Format: Keep a Changelog ✓'));
            console.log('');
          }
        }
      }
    }
    return 0;
  }

  // Bypass check
  if (hasBypass(root) && config.allow_bypass) {
    clearBypass(root);
    if (!isHook) {
      printHeader();
      console.log(yellow(bold('⚡ BYPASSED — one-time bypass used')));
      console.log(dim('  The bypass file has been consumed. Next commit will be enforced.'));
      console.log('');
    } else {
      console.log(yellow('changelog-enforcer: bypass used (one-time) — remember to update CHANGELOG.md'));
    }
    return 0;
  }

  const stats = isHook ? {} : parseDiffStat(root, sourceFiles);

  printHeader();
  printBlocked(sourceFiles, changelogFile, stats);
  return 1;
}

// ─── Commands ─────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const root = findGitRoot();

  if (!root) {
    console.error(red('  Error: Not inside a git repository.'));
    process.exit(1);
  }

  const config = loadConfig(root);

  // --hook-check <type>  (internal, called by hook scripts)
  if (args[0] === '--hook-check') {
    const hookType = args[1] || 'pre-commit';
    let files;
    if (hookType === 'pre-commit') {
      files = getStagedFiles(root);
    } else {
      files = getPushedFiles(root);
    }
    const code = runCheck({ root, config, files, isHook: true, hookType });
    process.exit(code);
  }

  // --hook pre-commit | --hook pre-push
  if (args[0] === '--hook') {
    printHeader();
    const hookType = args[1];
    if (!['pre-commit', 'pre-push'].includes(hookType)) {
      console.error(red(`  Error: Unknown hook type "${hookType}". Use pre-commit or pre-push.`));
      process.exit(1);
    }
    installHook(root, hookType);
    process.exit(0);
  }

  // --remove-hook
  if (args[0] === '--remove-hook') {
    printHeader();
    removeHook(root, 'all');
    process.exit(0);
  }

  // --bypass
  if (args[0] === '--bypass') {
    printHeader();
    if (!config.allow_bypass) {
      console.log(red('  Bypass is disabled in .changelog-enforcer.json'));
      process.exit(1);
    }
    createBypass(root);
    console.log(yellow(bold('⚡ Bypass created')));
    console.log(dim('  Next commit will skip changelog enforcement (once only).'));
    console.log('');
    process.exit(0);
  }

  // --validate
  if (args[0] === '--validate') {
    printHeader();
    const changelogPath = join(root, config.changelog);
    if (!existsSync(changelogPath)) {
      console.log(red(`  Error: ${config.changelog} not found.`));
      process.exit(1);
    }
    const content = readFileSync(changelogPath, 'utf8');
    const errors = validateKeepAChangelog(content);
    if (errors.length === 0) {
      console.log(green(bold(`✅ ${config.changelog} is valid Keep a Changelog format`)));
    } else {
      console.log(yellow(bold(`⚠️  ${config.changelog} has format issues:`)));
      errors.forEach(e => console.log(`  ${yellow('→')} ${e}`));
    }
    console.log('');
    process.exit(errors.length > 0 ? 1 : 0);
  }

  // --generate
  if (args[0] === '--generate') {
    printHeader();
    const staged = getStagedFiles(root);
    const sourceFiles = staged.filter(f => !isIgnored(f, config.ignore));
    if (sourceFiles.length === 0) {
      console.log(dim('No staged source changes to generate entry for.'));
      console.log('');
      process.exit(0);
    }
    const entry = suggestEntry(sourceFiles);
    console.log(bold('Generated CHANGELOG entry:'));
    console.log(dim('──────────────────────────'));
    console.log(cyan(entry));
    console.log(dim('──────────────────────────'));
    console.log('');
    console.log(dim('Copy the above into CHANGELOG.md before committing.'));
    console.log('');
    process.exit(0);
  }

  // --staged
  if (args[0] === '--staged') {
    printHeader();
    const files = getStagedFiles(root);
    const code = runCheck({ root, config, files });
    process.exit(code);
  }

  // --since <ref>
  if (args[0] === '--since') {
    printHeader();
    const since = args[1] || 'HEAD~1';
    const files = getChangedSince(root, since);
    const sourceFiles = files.filter(f => !isIgnored(f, config.ignore));
    const changelogChanged = files.includes(config.changelog);
    if (sourceFiles.length === 0) {
      printClean();
      process.exit(0);
    }
    if (!changelogChanged) {
      const stats = parseDiffStatRange(root, sourceFiles, since);
      printBlocked(sourceFiles, config.changelog, stats);
      process.exit(1);
    } else {
      printPassed(sourceFiles, config.changelog);
      process.exit(0);
    }
  }

  // --help / -h
  if (args[0] === '--help' || args[0] === '-h') {
    printHeader();
    console.log(bold('Usage:'));
    console.log('  npx changelog-enforcer                    Check current state (staged files)');
    console.log('  npx changelog-enforcer --staged           Check staged changes');
    console.log('  npx changelog-enforcer --since HEAD~5     Check last 5 commits');
    console.log('  npx changelog-enforcer --hook pre-commit  Install pre-commit hook');
    console.log('  npx changelog-enforcer --hook pre-push    Install pre-push hook');
    console.log('  npx changelog-enforcer --remove-hook      Remove installed hooks');
    console.log('  npx changelog-enforcer --bypass           Bypass enforcement once');
    console.log('  npx changelog-enforcer --validate         Validate CHANGELOG.md format');
    console.log('  npx changelog-enforcer --generate         Generate CHANGELOG entry from staged changes');
    console.log('');
    console.log(bold('Config:'));
    console.log('  .changelog-enforcer.json in project root');
    console.log('');
    process.exit(0);
  }

  // Default: check staged changes
  printHeader();
  const files = getStagedFiles(root);
  if (files.length === 0) {
    // Also check if there are any committed but unpushed changes
    const pushed = getPushedFiles(root);
    if (pushed.length > 0) {
      const code = runCheck({ root, config, files: pushed });
      process.exit(code);
    }
    printClean();
    process.exit(0);
  }
  const code = runCheck({ root, config, files });
  process.exit(code);
}

main().catch(err => {
  console.error(red('  Unexpected error: ' + err.message));
  process.exit(1);
});
