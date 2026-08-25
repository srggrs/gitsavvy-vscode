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
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        ],
      }
    );

    this.repo = new GitRepo(workspaceRoot);

    this.panel.webview.html = this.getHtml(this.panel.webview);

    const messageListener = this.panel.webview.onDidReceiveMessage(
      (msg: WebViewMessage) => this.handleMessage(msg, this.panel!)
    );

    // Watch .git/ directory for changes.
    // Git never modifies .git/index in place — it writes to .git/index.lock
    // then renames it, replacing the inode. On Linux, fs.watch() uses inotify
    // which tracks inodes, so watching the file directly never fires. Watching
    // the directory catches the rename/create events for both index (staging)
    // and HEAD (branch switches). Debounce to coalesce rapid events.
    const gitDir = path.join(workspaceRoot, '.git');
    let watcher: fs.FSWatcher | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      watcher = fs.watch(gitDir, () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          const p = this.panel;
          if (p) {
            this.refreshStatus(p);
          }
        }, 200);
      });
    } catch {
      // .git might not exist yet
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
      'dist'
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
