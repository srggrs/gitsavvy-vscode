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

        const branchName = (await vscode.window.showInputBox({
          prompt: 'New branch name',
          placeHolder: 'feature/my-branch',
        }))?.trim();
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
