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
          const wsRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (wsRoot) {
            const fileUri = vscode.Uri.file(
              path.join(wsRoot, msg.file)
            );
            await vscode.window.showTextDocument(fileUri);
          }
          break;
        }
        case 'openDiff': {
          const wsRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (wsRoot) {
            const fileUri = vscode.Uri.file(
              path.join(wsRoot, msg.file)
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
      <span class="hint">s: stage  u: unstage  d: diff  c: commit  Enter: open  r: refresh</span>
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
