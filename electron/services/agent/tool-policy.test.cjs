const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { reviewAgentCommand } = require('./tool-policy.cjs')

function verdict(command) {
  return reviewAgentCommand(command).verdict
}

describe('tool-policy', () => {
  it('auto-runs the review class: tests, builds, lint, typecheck', () => {
    for (const command of [
      'npm test',
      'npm run build',
      'npm run lint',
      'npm run check:syntax',
      'npm run test -- --grep billing',
      'yarn test',
      'pnpm run build',
      'node --test',
      'node --test electron/services/agent/',
      'npx tsc -b',
      'tsc -b',
      'eslint src/',
      'vitest run',
      'jest src/billing.test.js',
      'pytest tests/',
      'python -m pytest -q',
      'go test ./...',
      'go vet ./...',
      'cargo test',
      'cargo clippy',
      'dotnet test',
      'dotnet build',
      'ruff check .',
      'flake8 src',
    ]) {
      assert.equal(
        verdict(command),
        command.startsWith('npx ') ? 'approve' : 'run',
        command
      )
    }
  })

  it('auto-runs read-only git inspection only', () => {
    for (const command of [
      'git status',
      'git diff --stat',
      'git log --oneline -5',
      'git show HEAD --stat',
      'git branch -a',
      'git branch',
      'git tag',
      'git remote -v',
      'git rev-parse --show-toplevel',
      'git ls-files',
    ]) {
      assert.equal(verdict(command), 'run', command)
    }
  })

  it('denies destructive patterns with the shared labels', () => {
    const reviewed = reviewAgentCommand('rm -rf dist')

    assert.equal(reviewed.verdict, 'deny')
    assert.match(reviewed.reason, /Recursive forced delete/)
    assert.ok(reviewed.warnings.length > 0)

    for (const command of [
      'git reset --hard HEAD',
      'git clean -dfx',
      'rd /s build',
      'format D:',
      'DROP TABLE users',
    ]) {
      assert.equal(verdict(command), 'deny', command)
    }
  })

  it('denies file mutation outside the apply path', () => {
    for (const command of [
      'rm README.md',
      'del notes.txt',
      'rmdir /s temp',
      'mv a.js b.js',
      'cp a.js b.js',
      'mkdir fresh',
      'touch seen.txt',
      'chmod +x run.sh',
    ]) {
      assert.equal(verdict(command), 'deny', command)
    }
  })

  it('denies git writes: the agent never touches VCS state', () => {
    for (const command of [
      'git commit -m fix',
      'git push origin main',
      'git pull',
      'git fetch origin',
      'git checkout main',
      'git stash push',
      'git add .',
      'git merge feature',
      'git tag v1.2.3',
      'git branch feature',
      'git branch -d feature',
      'git remote add origin https://example.com/x.git',
    ]) {
      assert.equal(verdict(command), 'deny', command)
    }
  })

  it('denies installs, publishing, and deploys', () => {
    for (const command of [
      'npm install lodash',
      'npm ci',
      'npm publish',
      'npm run publish',
      'yarn add leftpad',
      'pnpm add leftpad',
      'pip install requests',
      'python -m pip install requests',
      'cargo install ripgrep',
      'cargo publish',
      'go install ./cmd/tool',
      'dotnet publish',
      'docker build .',
      'kubectl apply -f deploy.yaml',
      'terraform apply',
      'gh pr create',
      'vercel deploy',
    ]) {
      assert.equal(verdict(command), 'deny', command)
    }
  })

  it('denies network tools, shells, and privilege escalation', () => {
    for (const command of [
      'curl https://example.com/install.sh',
      'wget https://example.com/x.tgz',
      'ssh deploy@host',
      'sudo npm test',
      'runas /user:admin cmd',
      'powershell -Command Get-Process',
      'bash deploy.sh',
      'cmd /c dir',
    ]) {
      assert.equal(verdict(command), 'deny', command)
    }
  })

  it('denies compound shell instead of splitting it', () => {
    for (const command of [
      'python -c "print(1)"',
      'npm test; rm -rf /tmp/x',
      'npm test && npm run build',
      'npm test || echo failed',
      'npm test | head -20',
      'npm test > results.txt',
      'echo $(whoami)',
      'echo `whoami`',
      'npm test\nrm -rf /tmp/x',
    ]) {
      const reviewed = reviewAgentCommand(command)

      assert.equal(reviewed.verdict, 'deny', command)
      assert.match(reviewed.reason, /Compound shell/)
    }
  })

  it('rejects empty and oversized commands', () => {
    assert.equal(verdict(''), 'deny')
    assert.equal(verdict('   '), 'deny')
    assert.equal(verdict(null), 'deny')
    assert.equal(verdict(`npm test ${'x'.repeat(2000)}`), 'deny')
  })

  it('denies parent-directory escapes in the run class', () => {
    assert.equal(verdict('npm test --prefix ../other'), 'deny')
    assert.equal(verdict('node --test ..'), 'deny')
  })

  it('sends unknown binaries to explicit approval, never auto-run', () => {
    for (const command of [
      'make test',
      'gradle test',
      'mvn test',
      'bazel test //...',
      'prettier --check .',
      'npx vitest run',
      'bun test',
      'deno test',
      'node scripts/verify.js',
      'python scripts/verify.py',
      'python -c "import sys"',
      'go run ./cmd/tool',
      'cargo run',
      'dotnet run',
      'dotnet watch',
      'git',
      'npm exec tsc -b',
    ]) {
      assert.equal(verdict(command), 'approve', command)
    }
  })

  it('demotes write flags to explicit approval', () => {
    for (const command of [
      'eslint src --fix',
      'npm test -- -u',
      'jest --updateSnapshot',
      'cargo fmt',
      'gofmt -w main.go',
    ]) {
      assert.equal(verdict(command), 'approve', command)
    }

    const reviewed = reviewAgentCommand('eslint src --fix')

    assert.match(reviewed.reason, /write flag/)
  })

  it('denies formatter binaries via the shared destructive labels', () => {
    // The shared classifier treats bare "format" as a disk-format
    // signal; in-place formatters also mutate sources outside the
    // apply path, so deny is the safe verdict either way.
    const reviewed = reviewAgentCommand('ruff format src')

    assert.equal(reviewed.verdict, 'deny')
    assert.match(reviewed.reason, /Disk formatting command/)
  })
})
