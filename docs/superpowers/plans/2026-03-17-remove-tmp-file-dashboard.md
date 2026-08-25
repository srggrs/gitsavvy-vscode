# Remove Tmp File from Status Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `CustomReadonlyEditorProvider` + tmp file hack with a direct `vscode.window.createWebviewPanel` call so the dashboard tab no longer references a file on disk.

**Architecture:** `StatusDashboardProvider` becomes a plain class with an `open(subscriptions)` method that creates a `WebviewPanel` directly. All webview logic (HTML, message handling, file watcher) moves into `open()`. The custom editor provider registration and the sentinel file write are both removed.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode.window.createWebviewPanel`, `vscode.Disposable`)

**Spec:** `docs/superpowers/specs/2026-03-17-remove-tmp-file-dashboard-design.md`

---

## Chunk 1: Refactor `StatusDashboardProvider`

### Task 1: Create feature branch

**Files:**
- No file changes — git only

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feat/remove-tmp-file-dashboard
```

Expected: `Switched to a new branch 'feat/remove-tmp-file-dashboard'`

---

### Task 2: Refactor `StatusDashboardProvider`

**Files:**
- Modify: `src/views/statusDashboard.ts`

The goal is to:
- Remove `StatusDocument`, `CustomReadonlyEditorProvider`, `openCustomDocument`, `resolveCustomEditor`, and `dispose()`
- Replace `private panels` and `private watcher` fields with `private panel: vscode.WebviewPanel | undefined`
- Add `open(subscriptions: vscode.Disposable[]): void`

- [ ] **Step 1: Replace the full contents of `src/views/statusDashboard.ts`**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitRepo } from '../git/repo';
import { ExtensionMessage, WebViewMessage } from '../types';

export class StatusDashboardProvider {
  static readonly viewType = 'gitsavvy.statusDashboard';

  private panel: vscode.WebviewPanel | undefined;
  private repo: GitRepo | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  open(subscriptions: vscode.Disposable[]): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      StatusDashboardProvider.viewType,
      'GitSavvy Status',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'src', 'views', 'webview'),
        ],
      }
    );

    this.repo = new GitRepo(workspaceRoot);

    this.panel.webview.html = this.getHtml(this.panel.webview);

    const messageListener = this.panel.webview.onDidReceiveMessage(
      (msg: WebViewMessage) => this.handleMessage(msg, this.panel!)
    );

    // Watch .git/index for changes
    const gitIndexPath = path.join(workspaceRoot, '.git', 'index');
    let watcher: fs.FSWatcher | undefined;
    try {
      watcher = fs.watch(gitDir, () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          if (this.panel) {
            this.refreshStatus(this.panel);
          }
        }, 200);
      });
    } catch {
      // .git/index might not exist yet
    }

    this.panel.onDidDispose(() => {
      messageListener.dispose();
      clearTimeout(refreshTimer);
      watcher?.close();
      this.panel = undefined;
      this.repo = undefined;
    });

    subscriptions.push(this.panel);

    // Initial status fetch
    this.refreshStatus(this.panel);
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
          const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (wsRoot) {
            const fileUri = vscode.Uri.file(path.join(wsRoot, msg.file));
            await vscode.window.showTextDocument(fileUri);
          }
          break;
        }
        case 'openDiff': {
          const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (wsRoot) {
            const fileUri = vscode.Uri.file(path.join(wsRoot, msg.file));
            await vscode.commands.executeCommand('git.openChange', fileUri);
          }
          break;
        }
        case 'refresh':
          await this.refreshStatus(panel);
          break;
        case 'commit': {
          const message = await vscode.window.showInputBox({
            prompt: 'Commit message',
            placeHolder: 'Enter commit message',
          });
          if (message) {
            await this.repo.commit(message);
            await this.refreshStatus(panel);
          }
          break;
        }
        case 'push':
          await this.repo.push();
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
      <span class="hint">s: stage  u: unstage  d: diff  c: commit  p: push  Enter: open  r: refresh</span>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd /home/srg/Documents/projects/gitsavvy-vscode && npm run compile
```

Expected: exits 0, no errors printed

---

### Task 3: Refactor `extension.ts`

**Files:**
- Modify: `src/extension.ts`

Remove the custom editor registration, tmp file logic, and unused imports (`fs`, `path`, `os`). Call `provider.open(context.subscriptions)` instead.

- [ ] **Step 1: Replace the full contents of `src/extension.ts`**

```typescript
import * as vscode from 'vscode';
import { StatusDashboardProvider } from './views/statusDashboard';
import { GitRepo } from './git/repo';

export function activate(context: vscode.ExtensionContext) {
  const provider = new StatusDashboardProvider(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitsavvy.openStatusDashboard',
      () => provider.open(context.subscriptions)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitsavvy.checkoutNewBranch',
      async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }

        const branchName = await vscode.window.showInputBox({
          prompt: 'New branch name',
          placeHolder: 'feature/my-branch',
        });
        if (!branchName) return;

        try {
          const repo = new GitRepo(workspaceRoot);
          await repo.checkoutNewBranch(branchName);
          vscode.window.showInformationMessage(`Switched to new branch '${branchName}'`);
        } catch (err) {
          vscode.window.showErrorMessage(
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    )
  );
}

export function deactivate() {}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd /home/srg/Documents/projects/gitsavvy-vscode && npm run compile
```

Expected: exits 0, no errors printed

---

### Task 4: Remove `customEditors` from `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove the `customEditors` contribution block**

In `package.json`, delete the entire `"customEditors"` array (lines 24–35). The `"contributes"` object should only contain `"commands"` afterwards:

```json
"contributes": {
  "commands": [
    {
      "command": "gitsavvy.openStatusDashboard",
      "title": "GitSavvy: Open Status Dashboard"
    },
    {
      "command": "gitsavvy.checkoutNewBranch",
      "title": "GitSavvy: Checkout New Branch"
    }
  ]
},
```

- [ ] **Step 2: Build once more to confirm clean state**

```bash
cd /home/srg/Documents/projects/gitsavvy-vscode && npm run compile
```

Expected: exits 0, no errors printed

- [ ] **Step 3: Run unit tests**

```bash
cd /home/srg/Documents/projects/gitsavvy-vscode && npm run test:unit
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
cd /home/srg/Documents/projects/gitsavvy-vscode && git add src/views/statusDashboard.ts src/extension.ts package.json && git commit -m "refactor: replace CustomReadonlyEditorProvider with direct WebviewPanel

Removes the tmp file hack where openStatusDashboard wrote a sentinel
file to os.tmpdir() to trigger the custom editor. Now uses
vscode.window.createWebviewPanel directly — no file on disk needed.
Clicking the dashboard tab title no longer exposes the tmp folder.

- Remove StatusDocument, openCustomDocument, resolveCustomEditor
- Remove registerCustomEditorProvider registration
- Remove customEditors contribution point from package.json
- Fix onDidReceiveMessage disposable leak (was passing [] as thisArg)
- Clear this.repo on panel dispose to prevent stale references"
```

Expected: commit succeeds on branch `feat/remove-tmp-file-dashboard`
