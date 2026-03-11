# Status Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a GitSavvy-style status dashboard as a VS Code extension using a vanilla WebView custom editor tab.

**Architecture:** TypeScript extension with `CustomReadonlyEditorProvider` rendering a WebView editor tab. Git operations via `child_process.spawn`. Plain HTML/CSS/JS for the WebView with `postMessage` communication. Auto-refresh via `.git/index` file watcher.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild bundler, @vscode/test-cli + @vscode/test-electron for testing.

**Design doc:** `docs/plans/2026-03-11-status-dashboard-design.md`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscodeignore`
- Create: `.gitignore`
- Create: `esbuild.js`
- Create: `src/extension.ts` (minimal stub)

**Step 1: Create package.json**

```json
{
  "name": "gitsavvy-vscode",
  "displayName": "GitSavvy",
  "description": "GitSavvy-style git integration for VS Code",
  "version": "0.1.0",
  "publisher": "gitsavvy",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["SCM Providers"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "gitsavvy.openStatusDashboard",
        "title": "GitSavvy: Open Status Dashboard"
      }
    ],
    "customEditors": [
      {
        "viewType": "gitsavvy.statusDashboard",
        "displayName": "GitSavvy Status",
        "selector": [
          {
            "filenamePattern": "*.gitsavvy-status"
          }
        ],
        "priority": "default"
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "node esbuild.js --production",
    "compile": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "lint": "eslint src",
    "test": "vscode-test"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/vscode": "^1.85.0",
    "@vscode/test-cli": "^0.0.10",
    "@vscode/test-electron": "^2.4.1",
    "esbuild": "^0.24.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "dist", "out"]
}
```

**Step 3: Create esbuild.js**

```javascript
const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`\u2718 [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```

**Step 4: Create .vscodeignore**

```
.vscode/**
src/**
out/**
node_modules/**
.gitignore
tsconfig.json
esbuild.js
**/*.ts
**/*.map
docs/**
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
out/
*.vsix
```

**Step 6: Create minimal src/extension.ts**

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Extension activated
}

export function deactivate() {}
```

**Step 7: Install dependencies and verify build**

Run: `npm install && npm run compile`
Expected: Build succeeds, `dist/extension.js` is created.

**Step 8: Commit**

```bash
git add package.json tsconfig.json esbuild.js .vscodeignore .gitignore src/extension.ts package-lock.json
git commit -m "feat: scaffold VS Code extension project"
```

---

### Task 2: Types and Git CLI Wrapper

**Files:**
- Create: `src/types.ts`
- Create: `src/git/cli.ts`
- Create: `src/git/cli.test.ts`

**Step 1: Create src/types.ts**

```typescript
export type FileStatusCode = 'M' | 'A' | 'D' | 'R' | 'C' | '?' | '!';

export interface FileStatus {
  path: string;
  statusCode: FileStatusCode;
  /** For renames: the original path */
  origPath?: string;
}

export interface RepoStatus {
  branch: string;
  head: string;
  headMessage: string;
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: FileStatus[];
}

/** Messages from extension to WebView */
export type ExtensionMessage =
  | { type: 'status'; data: RepoStatus }
  | { type: 'error'; message: string };

/** Messages from WebView to extension */
export type WebViewMessage =
  | { type: 'stage'; files: string[] }
  | { type: 'unstage'; files: string[] }
  | { type: 'openFile'; file: string }
  | { type: 'openDiff'; file: string }
  | { type: 'refresh' };
```

**Step 2: Create src/git/cli.ts**

```typescript
import { spawn } from 'child_process';

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitCli {
  constructor(private cwd: string) {}

  async run(...args: string[]): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: this.cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
      });
      proc.on('error', reject);
    });
  }

  async stage(files: string[]): Promise<GitResult> {
    return this.run('add', '--', ...files);
  }

  async unstage(files: string[]): Promise<GitResult> {
    return this.run('restore', '--staged', '--', ...files);
  }
}
```

**Step 3: Write the failing test for GitCli**

Create `src/git/cli.test.ts`:

```typescript
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitCli } from './cli';

suite('GitCli', () => {
  let tmpDir: string;
  let git: GitCli;

  setup(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsavvy-test-'));
    git = new GitCli(tmpDir);
    await git.run('init');
    await git.run('config', 'user.email', 'test@test.com');
    await git.run('config', 'user.name', 'Test');
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('run returns stdout from git command', async () => {
    const result = await git.run('status', '--porcelain');
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, '');
  });

  test('stage adds file to index', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');
    await git.stage(['test.txt']);
    const result = await git.run('status', '--porcelain');
    assert.ok(result.stdout.includes('A  test.txt'));
  });

  test('unstage removes file from index', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');
    await git.stage(['test.txt']);
    await git.run('commit', '-m', 'initial');
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'changed');
    await git.stage(['test.txt']);
    await git.unstage(['test.txt']);
    const result = await git.run('status', '--porcelain');
    assert.ok(result.stdout.includes(' M test.txt'));
  });
});
```

**Step 4: Set up test config**

Create `.vscode-test.mjs`:

```javascript
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  mocha: {
    timeout: 10000,
  },
});
```

Note: For unit tests that don't need VS Code API (like GitCli), we can run them directly with a simple mocha setup. Add a mocha config:

Update `package.json` scripts to add:
```json
"pretest": "tsc -p ./",
"test:unit": "mocha out/git/*.test.js --timeout 10000"
```

**Step 5: Run tests to verify they pass**

Run: `npx tsc && npx mocha out/git/*.test.js --timeout 10000`
Expected: 3 tests pass.

**Step 6: Commit**

```bash
git add src/types.ts src/git/cli.ts src/git/cli.test.ts .vscode-test.mjs
git commit -m "feat: add types and git CLI wrapper with tests"
```

---

### Task 3: Git Status Parser

**Files:**
- Create: `src/git/status.ts`
- Create: `src/git/status.test.ts`

**Step 1: Write the failing test**

Create `src/git/status.test.ts`:

```typescript
import * as assert from 'assert';
import { parseStatus } from './status';

suite('parseStatus', () => {
  test('parses branch and head from porcelain v2', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '# branch.upstream origin/main',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.branch, 'main');
    assert.strictEqual(result.head, 'abc1234');
  });

  test('parses staged modified file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '1 M. N... 100644 100644 100644 abc1234 def5678 src/app.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 1);
    assert.strictEqual(result.staged[0].path, 'src/app.ts');
    assert.strictEqual(result.staged[0].statusCode, 'M');
  });

  test('parses unstaged modified file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '1 .M N... 100644 100644 100644 abc1234 def5678 src/index.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.unstaged.length, 1);
    assert.strictEqual(result.unstaged[0].path, 'src/index.ts');
    assert.strictEqual(result.unstaged[0].statusCode, 'M');
  });

  test('parses untracked file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '? README.md',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.untracked.length, 1);
    assert.strictEqual(result.untracked[0].path, 'README.md');
    assert.strictEqual(result.untracked[0].statusCode, '?');
  });

  test('parses staged added file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '1 A. N... 000000 100644 100644 0000000 abc1234 new-file.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 1);
    assert.strictEqual(result.staged[0].statusCode, 'A');
  });

  test('parses file that is both staged and unstaged', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '1 MM N... 100644 100644 100644 abc1234 def5678 src/both.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 1);
    assert.strictEqual(result.unstaged.length, 1);
    assert.strictEqual(result.staged[0].path, 'src/both.ts');
    assert.strictEqual(result.unstaged[0].path, 'src/both.ts');
  });

  test('parses renamed file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '2 R. N... 100644 100644 100644 abc1234 def5678 R100 new.ts\told.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 1);
    assert.strictEqual(result.staged[0].path, 'new.ts');
    assert.strictEqual(result.staged[0].origPath, 'old.ts');
    assert.strictEqual(result.staged[0].statusCode, 'R');
  });

  test('parses detached HEAD', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head (detached)',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.branch, '(detached)');
  });

  test('handles empty status', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 0);
    assert.strictEqual(result.unstaged.length, 0);
    assert.strictEqual(result.untracked.length, 0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx tsc && npx mocha out/git/status.test.js --timeout 10000`
Expected: FAIL — `parseStatus` not found.

**Step 3: Implement parseStatus**

Create `src/git/status.ts`:

```typescript
import { FileStatus, FileStatusCode, RepoStatus } from '../types';

export function parseStatus(output: string): RepoStatus {
  const lines = output.split('\n');
  let branch = '';
  let head = '';
  const staged: FileStatus[] = [];
  const unstaged: FileStatus[] = [];
  const untracked: FileStatus[] = [];

  for (const line of lines) {
    if (!line) continue;

    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length);
      continue;
    }

    if (line.startsWith('# branch.oid ')) {
      head = line.slice('# branch.oid '.length).slice(0, 7);
      continue;
    }

    if (line.startsWith('#')) continue;

    // Untracked
    if (line.startsWith('? ')) {
      untracked.push({
        path: line.slice(2),
        statusCode: '?',
      });
      continue;
    }

    // Ordinary changed entry: 1 XY sub mH mI mW hH hI path
    if (line.startsWith('1 ')) {
      const xy = line.slice(2, 4);
      const rest = line.slice(5);
      // path is after the 7th space-separated field
      const parts = rest.split(' ');
      const path = parts.slice(6).join(' ');
      const stagedCode = xy[0];
      const unstagedCode = xy[1];

      if (stagedCode !== '.') {
        staged.push({ path, statusCode: stagedCode as FileStatusCode });
      }
      if (unstagedCode !== '.') {
        unstaged.push({ path, statusCode: unstagedCode as FileStatusCode });
      }
      continue;
    }

    // Renamed/copied entry: 2 XY sub mH mI mW hH hI Xscore path\torigPath
    if (line.startsWith('2 ')) {
      const xy = line.slice(2, 4);
      const rest = line.slice(5);
      const parts = rest.split(' ');
      const pathPart = parts.slice(7).join(' ');
      const [newPath, origPath] = pathPart.split('\t');
      const stagedCode = xy[0];
      const unstagedCode = xy[1];

      if (stagedCode !== '.') {
        staged.push({
          path: newPath,
          origPath,
          statusCode: stagedCode as FileStatusCode,
        });
      }
      if (unstagedCode !== '.') {
        unstaged.push({
          path: newPath,
          origPath,
          statusCode: unstagedCode as FileStatusCode,
        });
      }
      continue;
    }
  }

  return { branch, head, headMessage: '', staged, unstaged, untracked };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx tsc && npx mocha out/git/status.test.js --timeout 10000`
Expected: All 9 tests pass.

**Step 5: Commit**

```bash
git add src/git/status.ts src/git/status.test.ts
git commit -m "feat: add git status porcelain v2 parser with tests"
```

---

### Task 4: Git Status Integration (CLI + Parser)

**Files:**
- Create: `src/git/repo.ts`
- Create: `src/git/repo.test.ts`

**Step 1: Write the failing test**

Create `src/git/repo.test.ts`:

```typescript
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitRepo } from './repo';

suite('GitRepo', () => {
  let tmpDir: string;
  let repo: GitRepo;

  setup(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsavvy-test-'));
    repo = new GitRepo(tmpDir);
    const { cli } = repo;
    await cli.run('init');
    await cli.run('config', 'user.email', 'test@test.com');
    await cli.run('config', 'user.name', 'Test');
    // Create initial commit so HEAD exists
    fs.writeFileSync(path.join(tmpDir, '.gitkeep'), '');
    await cli.stage(['.gitkeep']);
    await cli.run('commit', '-m', 'initial');
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('getStatus returns branch and head', async () => {
    const status = await repo.getStatus();
    assert.strictEqual(status.branch, 'main');
    assert.ok(status.head.length === 7);
  });

  test('getStatus shows untracked files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'hello');
    const status = await repo.getStatus();
    assert.strictEqual(status.untracked.length, 1);
    assert.strictEqual(status.untracked[0].path, 'new.txt');
  });

  test('getStatus shows staged files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'staged.txt'), 'hello');
    await repo.cli.stage(['staged.txt']);
    const status = await repo.getStatus();
    assert.strictEqual(status.staged.length, 1);
    assert.strictEqual(status.staged[0].path, 'staged.txt');
  });

  test('getHeadMessage returns last commit message', async () => {
    const status = await repo.getStatus();
    assert.strictEqual(status.headMessage, 'initial');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsc && npx mocha out/git/repo.test.js --timeout 10000`
Expected: FAIL — `GitRepo` not found.

**Step 3: Implement GitRepo**

Create `src/git/repo.ts`:

```typescript
import { GitCli } from './cli';
import { parseStatus } from './status';
import { RepoStatus } from '../types';

export class GitRepo {
  readonly cli: GitCli;

  constructor(private cwd: string) {
    this.cli = new GitCli(cwd);
  }

  async getStatus(): Promise<RepoStatus> {
    const result = await this.cli.run(
      'status',
      '--porcelain=v2',
      '--branch'
    );

    if (result.exitCode !== 0) {
      throw new Error(`git status failed: ${result.stderr}`);
    }

    const status = parseStatus(result.stdout);

    // Get HEAD commit message
    const logResult = await this.cli.run(
      'log',
      '-1',
      '--format=%s'
    );
    if (logResult.exitCode === 0) {
      status.headMessage = logResult.stdout.trim();
    }

    return status;
  }

  async stage(files: string[]): Promise<void> {
    const result = await this.cli.stage(files);
    if (result.exitCode !== 0) {
      throw new Error(`git add failed: ${result.stderr}`);
    }
  }

  async unstage(files: string[]): Promise<void> {
    const result = await this.cli.unstage(files);
    if (result.exitCode !== 0) {
      throw new Error(`git restore --staged failed: ${result.stderr}`);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx tsc && npx mocha out/git/repo.test.js --timeout 10000`
Expected: All 4 tests pass.

**Step 5: Commit**

```bash
git add src/git/repo.ts src/git/repo.test.ts
git commit -m "feat: add GitRepo integration layer with tests"
```

---

### Task 5: WebView HTML/CSS/JS

**Files:**
- Create: `src/views/webview/status.html`
- Create: `src/views/webview/status.css`
- Create: `src/views/webview/status.js`

**Step 1: Create src/views/webview/status.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet">
  <title>GitSavvy Status</title>
</head>
<body>
  <div id="dashboard">
    <div id="header"></div>
    <div id="sections"></div>
    <div id="footer">
      <hr>
      <span class="hint">s: stage  u: unstage  d: diff  Enter: open  r: refresh</span>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
```

**Step 2: Create src/views/webview/status.css**

```css
body {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: var(--vscode-editor-font-size, 14px);
  color: var(--vscode-editor-foreground);
  background-color: var(--vscode-editor-background);
  padding: 16px;
  line-height: 1.6;
  cursor: default;
  user-select: none;
}

#header {
  margin-bottom: 16px;
}

.header-line {
  color: var(--vscode-descriptionForeground);
}

.header-label {
  display: inline-block;
  min-width: 80px;
}

.header-value {
  color: var(--vscode-editor-foreground);
}

.section-header {
  color: var(--vscode-textLink-foreground);
  margin-top: 16px;
  margin-bottom: 8px;
}

.file-entry {
  padding: 2px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.file-entry:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.file-entry.selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.file-status {
  display: inline-block;
  min-width: 24px;
  margin-right: 8px;
}

.file-status.M { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
.file-status.A { color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b); }
.file-status.D { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }
.file-status.R { color: var(--vscode-gitDecoration-renamedResourceForeground, #73c991); }
.file-status.\? { color: var(--vscode-gitDecoration-untrackedResourceForeground, #73c991); }

.file-path {
  flex: 1;
}

#footer {
  margin-top: 24px;
}

#footer hr {
  border: none;
  border-top: 1px solid var(--vscode-panel-border);
}

.hint {
  color: var(--vscode-descriptionForeground);
  font-size: 0.9em;
}

.empty-section {
  color: var(--vscode-disabledForeground);
  padding-left: 8px;
  font-style: italic;
}
```

**Step 3: Create src/views/webview/status.js**

```javascript
// @ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  /** @type {import('../../types').RepoStatus | null} */
  let currentStatus = null;

  /** @type {{ section: string, index: number }} */
  let cursor = { section: 'staged', index: 0 };

  const sections = ['staged', 'unstaged', 'untracked'];

  function render() {
    if (!currentStatus) return;

    const header = document.getElementById('header');
    const sectionsEl = document.getElementById('sections');
    if (!header || !sectionsEl) return;

    header.innerHTML = [
      `<div class="header-line"><span class="header-label">BRANCH:</span> <span class="header-value">${esc(currentStatus.branch)}</span></div>`,
      `<div class="header-line"><span class="header-label">HEAD:</span> <span class="header-value">${esc(currentStatus.head)} ${esc(currentStatus.headMessage)}</span></div>`,
    ].join('');

    const sectionData = {
      staged: currentStatus.staged,
      unstaged: currentStatus.unstaged,
      untracked: currentStatus.untracked,
    };

    let html = '';
    for (const name of sections) {
      const files = sectionData[name];
      html += `<div class="section-header">## ${name} files</div>`;
      if (files.length === 0) {
        html += `<div class="empty-section">  (empty)</div>`;
      } else {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const selected = cursor.section === name && cursor.index === i;
          const label = f.origPath ? `${f.path} \u2190 ${f.origPath}` : f.path;
          html += `<div class="file-entry${selected ? ' selected' : ''}"
            data-section="${name}" data-index="${i}" data-path="${esc(f.path)}">
            <span class="file-status ${esc(f.statusCode)}">${esc(f.statusCode)}</span>
            <span class="file-path">${esc(label)}</span>
          </div>`;
        }
      }
    }
    sectionsEl.innerHTML = html;

    // Scroll selected into view
    const selected = document.querySelector('.file-entry.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  /** @param {string} s */
  function esc(s) {
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  function getFilesForSection(section) {
    if (!currentStatus) return [];
    return currentStatus[section] || [];
  }

  function getSelectedFile() {
    const files = getFilesForSection(cursor.section);
    return files[cursor.index] || null;
  }

  function moveCursor(direction) {
    if (!currentStatus) return;
    const files = getFilesForSection(cursor.section);

    if (direction === 'down') {
      if (cursor.index < files.length - 1) {
        cursor.index++;
      } else {
        // Move to next non-empty section
        let si = sections.indexOf(cursor.section);
        for (let i = 1; i <= sections.length; i++) {
          const nextSection = sections[(si + i) % sections.length];
          if (getFilesForSection(nextSection).length > 0) {
            cursor.section = nextSection;
            cursor.index = 0;
            break;
          }
        }
      }
    } else if (direction === 'up') {
      if (cursor.index > 0) {
        cursor.index--;
      } else {
        // Move to previous non-empty section
        let si = sections.indexOf(cursor.section);
        for (let i = 1; i <= sections.length; i++) {
          const prevSection = sections[(si - i + sections.length) % sections.length];
          const prevFiles = getFilesForSection(prevSection);
          if (prevFiles.length > 0) {
            cursor.section = prevSection;
            cursor.index = prevFiles.length - 1;
            break;
          }
        }
      }
    }
    render();
  }

  function cycleSection() {
    if (!currentStatus) return;
    let si = sections.indexOf(cursor.section);
    for (let i = 1; i <= sections.length; i++) {
      const nextSection = sections[(si + i) % sections.length];
      if (getFilesForSection(nextSection).length > 0) {
        cursor.section = nextSection;
        cursor.index = 0;
        render();
        break;
      }
    }
  }

  function clampCursor() {
    const files = getFilesForSection(cursor.section);
    if (files.length === 0) {
      // Find first non-empty section
      for (const s of sections) {
        if (getFilesForSection(s).length > 0) {
          cursor.section = s;
          cursor.index = 0;
          return;
        }
      }
      cursor.index = 0;
    } else {
      cursor.index = Math.min(cursor.index, files.length - 1);
    }
  }

  // Keyboard handling
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        moveCursor('down');
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        moveCursor('up');
        break;
      case 'Tab':
        e.preventDefault();
        cycleSection();
        break;
      case 's': {
        const file = getSelectedFile();
        if (file) {
          vscode.postMessage({ type: 'stage', files: [file.path] });
        }
        break;
      }
      case 'u': {
        const file = getSelectedFile();
        if (file) {
          vscode.postMessage({ type: 'unstage', files: [file.path] });
        }
        break;
      }
      case 'd': {
        const file = getSelectedFile();
        if (file) {
          vscode.postMessage({ type: 'openDiff', file: file.path });
        }
        break;
      }
      case 'Enter': {
        const file = getSelectedFile();
        if (file) {
          vscode.postMessage({ type: 'openFile', file: file.path });
        }
        break;
      }
      case 'r':
        vscode.postMessage({ type: 'refresh' });
        break;
    }
  });

  // Click handling
  document.addEventListener('click', (e) => {
    const entry = /** @type {HTMLElement} */ (e.target).closest('.file-entry');
    if (entry) {
      const section = entry.getAttribute('data-section');
      const index = parseInt(entry.getAttribute('data-index') || '0', 10);
      if (section) {
        cursor.section = section;
        cursor.index = index;
        render();
      }
    }
  });

  // Message handling
  window.addEventListener('message', (e) => {
    const msg = e.data;
    switch (msg.type) {
      case 'status':
        currentStatus = msg.data;
        clampCursor();
        render();
        break;
      case 'error':
        // Show error in header
        const header = document.getElementById('header');
        if (header) {
          header.innerHTML = `<div class="header-line" style="color: var(--vscode-errorForeground)">Error: ${esc(msg.message)}</div>`;
        }
        break;
    }
  });
})();
```

**Step 4: Verify files exist and are well-formed**

Run: `ls -la src/views/webview/`
Expected: `status.html`, `status.css`, `status.js` all present.

**Step 5: Commit**

```bash
git add src/views/webview/
git commit -m "feat: add WebView HTML/CSS/JS for status dashboard"
```

---

### Task 6: Status Dashboard Editor Provider

**Files:**
- Create: `src/views/statusDashboard.ts`
- Modify: `src/extension.ts`

**Step 1: Create src/views/statusDashboard.ts**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitRepo } from '../git/repo';
import { ExtensionMessage, WebViewMessage } from '../types';

class StatusDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri) {}
  dispose() {}
}

export class StatusDashboardProvider
  implements vscode.CustomReadonlyEditorProvider<StatusDocument>
{
  static readonly viewType = 'gitsavvy.statusDashboard';

  private repo: GitRepo | undefined;
  private panels = new Set<vscode.WebviewPanel>();
  private watcher: fs.FSWatcher | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): StatusDocument {
    return new StatusDocument(uri);
  }

  resolveCustomEditor(
    _document: StatusDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    this.panels.add(webviewPanel);
    webviewPanel.onDidDispose(() => this.panels.delete(webviewPanel));

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.postMessage(webviewPanel, {
        type: 'error',
        message: 'No workspace folder open',
      });
      return;
    }

    this.repo = new GitRepo(workspaceRoot);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'src', 'views', 'webview'),
      ],
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    // Handle messages from WebView
    webviewPanel.webview.onDidReceiveMessage(
      (msg: WebViewMessage) => this.handleMessage(msg, webviewPanel),
      undefined,
      []
    );

    // Initial status fetch
    this.refreshStatus(webviewPanel);

    // Watch .git/index for changes
    this.setupWatcher(workspaceRoot, webviewPanel);
  }

  private async handleMessage(
    msg: WebViewMessage,
    panel: vscode.WebviewPanel
  ) {
    if (!this.repo) return;

    try {
      switch (msg.type) {
        case 'stage':
          await this.repo.stage(msg.files);
          await this.refreshStatus(panel);
          break;
        case 'unstage':
          await this.repo.unstage(msg.files);
          await this.refreshStatus(panel);
          break;
        case 'openFile': {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            const fileUri = vscode.Uri.file(
              path.join(workspaceRoot, msg.file)
            );
            await vscode.window.showTextDocument(fileUri);
          }
          break;
        }
        case 'openDiff': {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            const fileUri = vscode.Uri.file(
              path.join(workspaceRoot, msg.file)
            );
            await vscode.commands.executeCommand(
              'git.openChange',
              fileUri
            );
          }
          break;
        }
        case 'refresh':
          await this.refreshStatus(panel);
          break;
      }
    } catch (err) {
      this.postMessage(panel, {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async refreshStatus(panel: vscode.WebviewPanel) {
    if (!this.repo) return;
    try {
      const status = await this.repo.getStatus();
      this.postMessage(panel, { type: 'status', data: status });
    } catch (err) {
      this.postMessage(panel, {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private postMessage(panel: vscode.WebviewPanel, msg: ExtensionMessage) {
    panel.webview.postMessage(msg);
  }

  private setupWatcher(
    workspaceRoot: string,
    panel: vscode.WebviewPanel
  ) {
    const gitIndexPath = path.join(workspaceRoot, '.git', 'index');
    try {
      this.watcher?.close();
      this.watcher = fs.watch(gitIndexPath, () => {
        this.refreshStatus(panel);
      });
      panel.onDidDispose(() => {
        this.watcher?.close();
        this.watcher = undefined;
      });
    } catch {
      // .git/index might not exist yet
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const webviewDir = vscode.Uri.joinPath(
      this.context.extensionUri,
      'src',
      'views',
      'webview'
    );

    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDir, 'status.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDir, 'status.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet">
  <title>GitSavvy Status</title>
</head>
<body>
  <div id="dashboard">
    <div id="header">Loading...</div>
    <div id="sections"></div>
    <div id="footer">
      <hr>
      <span class="hint">s: stage  u: unstage  d: diff  Enter: open  r: refresh</span>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose() {
    this.watcher?.close();
  }
}

function getNonce(): string {
  let text = '';
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
```

**Step 2: Update src/extension.ts**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { StatusDashboardProvider } from './views/statusDashboard';

export function activate(context: vscode.ExtensionContext) {
  const provider = new StatusDashboardProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      StatusDashboardProvider.viewType,
      provider,
      { supportsMultipleEditorsPerDocument: false }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitsavvy.openStatusDashboard',
      async () => {
        // Create a temporary .gitsavvy-status file to trigger the custom editor
        const tmpFile = path.join(os.tmpdir(), 'gitsavvy.gitsavvy-status');
        if (!fs.existsSync(tmpFile)) {
          fs.writeFileSync(tmpFile, '');
        }
        const uri = vscode.Uri.file(tmpFile);
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          StatusDashboardProvider.viewType
        );
      }
    )
  );
}

export function deactivate() {}
```

**Step 3: Verify build succeeds**

Run: `npm run compile`
Expected: Build succeeds without errors.

**Step 4: Commit**

```bash
git add src/views/statusDashboard.ts src/extension.ts
git commit -m "feat: add status dashboard editor provider and extension wiring"
```

---

### Task 7: Manual Testing & Polish

**Files:**
- Possibly modify: `src/views/webview/status.css`
- Possibly modify: `src/views/webview/status.js`
- Possibly modify: `src/views/statusDashboard.ts`

**Step 1: Test the extension manually**

Run: Press F5 in VS Code to launch the Extension Development Host (or run `code --extensionDevelopmentPath=$(pwd)` from a terminal).

In the Extension Development Host:
1. Open a git repository
2. Run command palette → "GitSavvy: Open Status Dashboard"
3. Verify: Dashboard opens as a tab
4. Verify: Branch name, HEAD, and file lists display correctly
5. Verify: `j`/`k` navigation works
6. Verify: `s` stages a file, `u` unstages
7. Verify: `d` opens diff, `Enter` opens file
8. Verify: `r` refreshes
9. Verify: Auto-refresh when staging from terminal

**Step 2: Fix any issues found**

Address bugs and polish the UI as needed.

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: polish dashboard UI and fix issues from manual testing"
```

---

### Task 8: Final Cleanup

**Files:**
- Modify: `package.json` (verify all fields)
- Possibly create: `.vscode/launch.json` (for F5 debugging)

**Step 1: Create .vscode/launch.json for debugging**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

**Step 2: Create .vscode/tasks.json**

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "watch",
      "problemMatcher": "$esbuild-watch",
      "isBackground": true,
      "presentation": {
        "reveal": "never"
      },
      "group": {
        "kind": "build",
        "isDefault": true
      }
    }
  ]
}
```

**Step 3: Run all tests one final time**

Run: `npx tsc && npx mocha 'out/git/*.test.js' --timeout 10000`
Expected: All tests pass.

**Step 4: Final commit**

```bash
git add .vscode/launch.json .vscode/tasks.json
git commit -m "chore: add VS Code launch and task configs for development"
```
