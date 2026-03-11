import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { StatusDashboardProvider } from './views/statusDashboard';
import { GitRepo } from './git/repo';

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
