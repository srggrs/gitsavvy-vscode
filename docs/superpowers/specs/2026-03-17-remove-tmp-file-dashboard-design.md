# Design: Remove tmp file from status dashboard

## Problem

`gitsavvy.openStatusDashboard` writes a sentinel file to `os.tmpdir()` and opens it via `vscode.openWith` to trigger the `CustomReadonlyEditorProvider`. Clicking the tab name in VS Code navigates to the tmp folder, exposing unrelated files.

## Chosen Approach

Use `vscode.window.createWebviewPanel` directly. No file on disk is needed.

## Architecture

### `StatusDashboardProvider` (refactored)

- Remove `CustomReadonlyEditorProvider` interface and `StatusDocument` class
- Replace `private panels: Set<vscode.WebviewPanel>` with `private panel: vscode.WebviewPanel | undefined` — at most one panel exists at a time
- Remove `private watcher: fs.FSWatcher | undefined` from instance state; scope the watcher as a local variable inside `open()` and close it in the panel's `onDidDispose` callback
- `this.repo: GitRepo | undefined` stays as an instance field; it is assigned inside `open()`. It is also cleared in `onDidDispose` to prevent `handleMessage` or `refreshStatus` from acting on a stale repo after the panel is gone
- Keep `static readonly viewType = 'gitsavvy.statusDashboard'` — reused as the first argument to `createWebviewPanel`. The string value is arbitrary; reusing it is fine for consistency and causes no conflict with the now-removed custom editor registration
- Remove `dispose()` method — cleanup is handled by `onDidDispose` on the panel
- Add `open(subscriptions: vscode.Disposable[]): void` method that:
  - If `this.panel` is already set, calls `this.panel.reveal()` and returns
  - Checks for a workspace folder before creating the panel; if none exists, calls `vscode.window.showErrorMessage('No workspace folder open')` and returns
  - Otherwise calls `vscode.window.createWebviewPanel('gitsavvy.statusDashboard', 'GitSavvy Status', vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] })` — `retainContextWhenHidden` is intentionally omitted; the dashboard re-fetches status on open so rebuilding the webview on show is acceptable
  - Note: the separate `webviewPanel.webview.options = { ... }` assignment that exists in the current `resolveCustomEditor` is removed; options are passed directly as the fourth argument to `createWebviewPanel`
  - Assigns result to `this.panel`; pushes `this.panel` to `subscriptions` (`vscode.WebviewPanel` implements `vscode.Disposable` so this is valid) for cleanup at extension deactivation. If the user closes the panel normally before deactivation, `onDidDispose` fires and clears `this.panel`, so a subsequent call to `open()` will create a fresh panel correctly
  - Registers `onDidReceiveMessage`; captures its return value (a `vscode.Disposable`) and disposes it in `onDidDispose` (replaces the current `[]` third-argument pattern, which was incorrect — the third argument to `onDidReceiveMessage` is `thisArg`, not a disposables array)
  - Wires up webview HTML, message handling, and the `.git/` directory watcher (debounced at 200ms) — same logic as current `resolveCustomEditor`
  - The watcher is created once and closed in `onDidDispose`; the close-before-create guard from `setupWatcher` is dropped as it is dead code in the single-panel design

### `extension.ts` (refactored)

- Remove `registerCustomEditorProvider` registration
- Remove `fs`, `path`, `os` imports
- Command handler calls `provider.open(context.subscriptions)` instead of writing a file and calling `vscode.openWith`

### `package.json`

- Remove the `customEditors` contribution point entry (the `.gitsavvy-status` association); it becomes dead weight after removing `registerCustomEditorProvider` and could cause VS Code warnings

### Removed

- `StatusDocument` class
- `openCustomDocument` method
- `resolveCustomEditor` method
- `dispose()` method on `StatusDashboardProvider`
- `vscode.window.registerCustomEditorProvider` call
- Tmp file write logic in the command handler
- Instance-level `this.watcher` and `this.panels` fields (replaced by `this.panel`)
- Close-before-create watcher guard
- Separate `webviewPanel.webview.options` assignment (options moved into `createWebviewPanel` call)

## What stays the same

- All webview assets (`status.html` template, `status.css`, `status.js`) — untouched
- All message handling (`handleMessage`, `refreshStatus`, `postMessage`)
- `.git/index` file watcher logic (scoped locally in `open()`)
- CSP / nonce logic

## Out of scope

- No changes to git operations (`cli.ts`, `repo.ts`, `status.ts`)
- No changes to webview UI behaviour
