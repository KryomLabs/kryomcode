// Agent command policy (Milestone 3). Decides what the autonomous
// agent may do with a model-proposed shell command. Pure and
// side-effect free: it returns a verdict, it never executes.
//
// Verdicts:
// - "run": narrow review class (read-only inspection, project test /
//   build / lint / typecheck commands). Runs only when listed in a
//   user-approved plan — never on model say-so alone.
// - "approve": anything else non-destructive. Runs only after an
//   explicit per-command user approval that shows the full command,
//   the agent's stated purpose, and this policy's reason.
// - "deny": destructive or side-effecting commands. Never runs, with
//   no override path. Denied checks are recorded as not-executed
//   with the reason — never faked green.
//
// This extends the advisory `classifyCommand` patterns (which stay
// the single source of destructive-pattern labels) with agent-only
// deny rules: file mutation, VCS writes, installs, publishing,
// deploys, network tools, privilege escalation, and compound-shell
// smuggling. Unknown commands default to "approve" (human decides),
// never to "run".
const {
  classifyCommand,
} = require('../terminal/command-validator.cjs')

const MAX_COMMAND_LENGTH = 2000

// Shell metacharacters that turn one command into several or move
// data across boundaries. The agent proposes single commands; a
// compound proposal is denied with guidance instead of being split
// (splitting model-proposed shell is itself a parser risk).
const COMPOUND_PATTERN = /[;&|`$()<>]|\|\||&&|\n/

// First tokens that read or check without mutating the project.
// Flags that imply writes (--fix, snapshot updates) demote to
// "approve" via WRITE_FLAG_PATTERN.
const RUN_BINARIES = new Set([
  'npm',
  'yarn',
  'pnpm',
  'node',
  'tsc',
  'eslint',
  'vitest',
  'jest',
  'mocha',
  'pytest',
  'python',
  'python3',
  'go',
  'cargo',
  'dotnet',
  'ruff',
  'flake8',
  'shellcheck',
])

// npm/yarn/pnpm subcommands that only run local scripts or report.
// `exec` is deliberately absent: `npm exec` can fetch a remote
// package like npx, so it needs human review. `npx`, `deno`, and
// `bun` are absent from RUN_BINARIES for the same reason.
const RUN_SCRIPT_SUBCOMMANDS = new Set([
  'test',
  'run',
  'run-script',
  'ls',
  'list',
  '--version',
  '-v',
])

const WRITE_FLAG_PATTERN =
  /(^|\s)(--fix|--write|-w|-u|--update-snapshot|--update-snapshots|--updatesnapshot|format|fmt)(\s|$|=)/i

// Read-only git subcommands. Every other git subcommand is denied:
// the agent inspects history, it never mutates VCS state (no commit,
// push, pull, fetch, checkout, stash, reset, or clean — the last two
// also trip the destructive patterns).
const GIT_READ_SUBCOMMANDS = new Set([
  'status',
  'diff',
  'diff-tree',
  'log',
  'show',
  'branch',
  'rev-parse',
  'ls-files',
  'ls-tree',
  'describe',
  'remote',
  'tag',
  '--version',
])

// Read-only only when listing: `git branch foo`, `git tag v1`, and
// `git remote add` all WRITE repository state, so these subcommands
// auto-run solely with flag-only arguments (or none).
const GIT_LIST_ONLY_SUBCOMMANDS = new Set(['branch', 'tag', 'remote'])

// First tokens (or manager subcommands) that install, remove,
// publish, deploy, or reach the network. Matched on the binary name
// and, for package managers, the subcommand.
const DENY_BINARIES = new Set([
  'rm',
  'del',
  'erase',
  'rmdir',
  'rd',
  'mv',
  'move',
  'cp',
  'copy',
  'mkdir',
  'md',
  'touch',
  'chmod',
  'chown',
  'chgrp',
  'attrib',
  'takeown',
  'icacls',
  'format',
  'mkfs',
  'diskpart',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'sudo',
  'su',
  'doas',
  'runas',
  'curl',
  'wget',
  'aria2c',
  'ssh',
  'scp',
  'sftp',
  'ftp',
  'telnet',
  'nc',
  'ncat',
  'socat',
  'docker',
  'podman',
  'nerdctl',
  'kubectl',
  'helm',
  'terraform',
  'tofu',
  'az',
  'aws',
  'gcloud',
  'heroku',
  'vercel',
  'netlify',
  'fly',
  'gh',
  'pip',
  'pip3',
  'conda',
  'mamba',
  'gem',
  'brew',
  'apt',
  'apt-get',
  'yum',
  'dnf',
  'pacman',
  'zypper',
  'apk',
  'choco',
  'scoop',
  'winget',
  'sh',
  'bash',
  'dash',
  'zsh',
  'fish',
  'ksh',
  'cmd',
  'powershell',
  'pwsh',
])

const DENY_MANAGER_SUBCOMMANDS = new Set([
  'install',
  'i',
  'ci',
  'add',
  'remove',
  'rm',
  'uninstall',
  'un',
  'update',
  'upgrade',
  'up',
  'publish',
  'login',
  'logout',
  'link',
  'unlink',
  'pack',
  'audit',
  'audit signatures',
  'dedupe',
  'prune',
  'init',
])

const MANAGERS = new Set(['npm', 'yarn', 'pnpm'])

// `npm run <name>` executes the project's own script, so script names
// that conventionally publish, deploy, or install are denied even
// though `run` itself is review-class.
const DENY_SCRIPT_NAMES = new Set([
  'publish',
  'prepublish',
  'prepublishonly',
  'postpublish',
  'deploy',
  'predeploy',
  'postdeploy',
  'release',
  'prerelease',
  'postrelease',
  'install',
  'preinstall',
  'postinstall',
  'login',
  'logout',
])

const DENY_DOTNET_SUBCOMMANDS = new Set([
  'new',
  'add',
  'remove',
  'publish',
  'pack',
  'push',
  'nuget',
  'tool',
  'restore',
  'migrate',
])

const DENY_CARGO_SUBCOMMANDS = new Set([
  'install',
  'uninstall',
  'publish',
  'update',
  'add',
  'remove',
])

const DENY_GO_SUBCOMMANDS = new Set(['install', 'get'])

function baseNameOf(token) {
  const cleaned = token.replace(/["']/g, '').trim()
  const parts = cleaned.split(/[\\/]/)

  return parts[parts.length - 1].toLowerCase().replace(/\.exe$/, '').replace(/\.cmd$/, '')
}

function tokenize(command) {
  return command.trim().split(/\s+/).filter(Boolean)
}

// Parenthesized or quoted segments are irrelevant here: any compound
// metacharacter anywhere denies, so no quote-aware parse is needed.
function reviewAgentCommand(command) {
  if (typeof command !== 'string' || !command.trim()) {
    return {
      verdict: 'deny',
      reason: 'Empty command.',
      warnings: [],
    }
  }

  if (command.length > MAX_COMMAND_LENGTH) {
    return {
      verdict: 'deny',
      reason: `Command exceeds ${MAX_COMMAND_LENGTH} characters.`,
      warnings: [],
    }
  }

  const text = command.trim()

  if (COMPOUND_PATTERN.test(text)) {
    return {
      verdict: 'deny',
      reason:
        'Compound shell (chaining, pipes, redirection, or substitution) is not allowed. ' +
        'Propose one plain command instead.',
      warnings: classifyCommand(text),
    }
  }

  const warnings = classifyCommand(text)

  if (warnings.length > 0) {
    return {
      verdict: 'deny',
      reason: `Destructive pattern: ${warnings.join(' ')}`,
      warnings,
    }
  }

  const tokens = tokenize(text)
  const binary = baseNameOf(tokens[0])
  const args = tokens.slice(1)

  if (DENY_BINARIES.has(binary)) {
    return {
      verdict: 'deny',
      reason:
        `"${binary}" can mutate files, install software, reach the network, ` +
        'or change privilege. The agent never runs it.',
      warnings,
    }
  }

  if (binary === 'git') {
    const sub = (args[0] || '').toLowerCase()

    if (!sub) {
      return {
        verdict: 'approve',
        reason: 'Bare `git` needs explicit approval.',
        warnings,
      }
    }

    if (GIT_READ_SUBCOMMANDS.has(sub)) {
      if (
        GIT_LIST_ONLY_SUBCOMMANDS.has(sub) &&
        args.slice(1).some((arg) => !arg.startsWith('-'))
      ) {
        return {
          verdict: 'deny',
          reason: `git "${sub}" with a name argument mutates repository state. The agent only runs read-only git inspection.`,
          warnings,
        }
      }

      return { verdict: 'run', reason: 'Read-only git inspection.', warnings }
    }

    return {
      verdict: 'deny',
      reason:
        `git "${sub || '(missing)'}" can mutate repository state. ` +
        'The agent only runs read-only git inspection.',
      warnings,
    }
  }

  if (MANAGERS.has(binary)) {
    const sub = (args[0] || '').toLowerCase()

    if (DENY_MANAGER_SUBCOMMANDS.has(sub)) {
      return {
        verdict: 'deny',
        reason: `"${binary} ${sub}" installs, removes, updates, or publishes. The agent never runs it.`,
        warnings,
      }
    }

    if (sub === 'run' || sub === 'run-script') {
      const scriptName = (args[1] || '').toLowerCase()

      if (DENY_SCRIPT_NAMES.has(scriptName)) {
        return {
          verdict: 'deny',
          reason: `"${binary} run ${args[1]}" publishes, deploys, or installs. The agent never runs it.`,
          warnings,
        }
      }
    }

    if (RUN_SCRIPT_SUBCOMMANDS.has(sub)) {
      return reviewRunClass(text, binary, args, warnings, 'Project script execution.')
    }

    return {
      verdict: 'approve',
      reason: `"${binary} ${sub || '(missing)'}" is outside the auto-run class; it needs explicit approval.`,
      warnings,
    }
  }

  if (binary === 'dotnet' && DENY_DOTNET_SUBCOMMANDS.has((args[0] || '').toLowerCase())) {
    return {
      verdict: 'deny',
      reason: `"dotnet ${args[0]}" mutates or publishes. The agent never runs it.`,
      warnings,
    }
  }

  if (binary === 'cargo' && DENY_CARGO_SUBCOMMANDS.has((args[0] || '').toLowerCase())) {
    return {
      verdict: 'deny',
      reason: `"cargo ${args[0]}" installs, updates, or publishes. The agent never runs it.`,
      warnings,
    }
  }

  if (binary === 'go' && DENY_GO_SUBCOMMANDS.has((args[0] || '').toLowerCase())) {
    return {
      verdict: 'deny',
      reason: `"go ${args[0]}" installs or fetches modules. The agent never runs it.`,
      warnings,
    }
  }

  if (RUN_BINARIES.has(binary)) {
    return reviewRunClass(text, binary, args, warnings, 'Test, build, lint, or typecheck command.')
  }

  // Unknown binaries are never auto-run: the human reviews the full
  // command text before anything executes.
  return {
    verdict: 'approve',
    reason: `"${binary}" is outside the auto-run class; it needs explicit approval.`,
    warnings,
  }
}

function reviewRunClass(text, binary, args, warnings, reason) {
  if (WRITE_FLAG_PATTERN.test(` ${args.join(' ')} `)) {
    return {
      verdict: 'approve',
      reason: 'The command carries a write flag (fix/update); it needs explicit approval.',
      warnings,
    }
  }

  if (args.some((arg) => arg === '..' || arg.includes('../') || arg.includes('..\\'))) {
    return {
      verdict: 'deny',
      reason: 'Auto-run commands cannot reference parent directories.',
      warnings,
    }
  }

  if (binary === 'node' && args.length > 0 && !args[0].startsWith('-')) {
    // `node <file>` executes repo code directly; tests already do
    // that through runners, so a bare script run gets human review.
    return {
      verdict: 'approve',
      reason: '`node <file>` executes a script directly; it needs explicit approval.',
      warnings,
    }
  }

  if (binary === 'python' || binary === 'python3') {
    if (args[0] === '-m' && (args[1] || '').toLowerCase() === 'pip') {
      return {
        verdict: 'deny',
        reason: '`python -m pip` installs or removes packages. The agent never runs it.',
        warnings,
      }
    }

    if (args[0] === '-m') {
      return { verdict: 'run', reason, warnings }
    }

    if (args.length > 0 && !args[0].startsWith('-')) {
      return {
        verdict: 'approve',
        reason: '`python <file>` executes a script directly; it needs explicit approval.',
        warnings,
      }
    }

    if (args[0] === '-c') {
      return {
        verdict: 'approve',
        reason: '`python -c` runs inline code; it needs explicit approval.',
        warnings,
      }
    }
  }

  if (binary === 'go' && (args[0] || '').toLowerCase() === 'run') {
    return {
      verdict: 'approve',
      reason: '`go run` executes project code; it needs explicit approval.',
      warnings,
    }
  }

  if (binary === 'cargo' && (args[0] || '').toLowerCase() === 'run') {
    return {
      verdict: 'approve',
      reason: '`cargo run` executes project code; it needs explicit approval.',
      warnings,
    }
  }

  const dotnetSub = (args[0] || '').toLowerCase()

  if (binary === 'dotnet' && (dotnetSub === 'run' || dotnetSub === 'watch')) {
    return {
      verdict: 'approve',
      reason: `\`dotnet ${dotnetSub}\` executes project code; it needs explicit approval.`,
      warnings,
    }
  }

  return { verdict: 'run', reason, warnings }
}

module.exports = {
  reviewAgentCommand,
  MAX_COMMAND_LENGTH,
}
