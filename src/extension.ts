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
