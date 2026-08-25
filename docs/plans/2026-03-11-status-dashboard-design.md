# GitSavvy for VS Code: Status Dashboard Design

## Overview

Port of GitSavvy's Sublime Text status dashboard to VS Code. The dashboard opens as a custom editor tab (WebView) with a plain-text, Sublime GitSavvy-style layout and keyboard-driven interaction.

## Scope (v1)

- Status dashboard only (no log, branch, or stash views)
- Single repository support (no multi-root workspaces)
- Three file sections: staged, unstaged, untracked
- Actions: stage, unstage, open file, open diff (VS Code built-in)
- Git operations via CLI (`child_process.spawn`)
- Auto-refresh via `.git/index` file watcher

## Architecture

**Approach: Vanilla WebView**

Plain HTML/CSS/JS for the WebView — no framework. The extension uses a `CustomReadonlyEditorProvider` to render the dashboard as an editor tab. Communication between extension and WebView via `postMessage`.

## Extension Structure

```
gitsavvy-vscode/
├── src/
│   ├── extension.ts              # Entry point, registers commands/providers
│   ├── git/
│   │   ├── cli.ts                # Git CLI wrapper (spawn, parse, error handling)
│   │   └── status.ts             # Parse git status --porcelain=v2 into typed data
│   ├── views/
│   │   ├── statusDashboard.ts    # CustomEditorProvider for the dashboard
│   │   └── webview/
│   │       ├── status.html       # Dashboard HTML template
│   │       ├── status.css        # Styles (VS Code CSS variables for theming)
│   │       └── status.js         # Keyboard handling, DOM rendering, postMessage
│   └── types.ts                  # Shared types (FileStatus, Section, etc.)
├── package.json                  # Extension manifest
├── tsconfig.json
└── .vscodeignore
```

## UI Layout

Sublime GitSavvy-style plain text layout:

```
BRANCH: main
ROOT:   ~/projects/my-project
HEAD:   abc1234 Fix the thing

## staged files

   M src/app.ts
   A src/utils.ts

## unstaged files

   M src/index.ts

## untracked files

   ? README.md
   ? .gitignore

─────────────────────────────────
s: stage  u: unstage  d: diff
```

## Keyboard Shortcuts

When the dashboard WebView is focused:

| Key                | Action                     |
| ------------------ | -------------------------- |
| `j` / `k` / arrows | Navigate files             |
| `s`                | Stage file                 |
| `u`                | Unstage file               |
| `d`                | Open VS Code built-in diff |
| `Enter`            | Open file in editor        |
| `Tab`              | Cycle between sections     |
| `r`                | Refresh status             |

## Command Palette Commands

- `GitSavvy: Open Status Dashboard`
- `GitSavvy: Stage File`
- `GitSavvy: Unstage File`
- `GitSavvy: Refresh Status`

## Data Flow

```
Extension (Node.js)          ←→  postMessage  ←→          WebView (Browser)

git/cli.ts runs commands                                   status.js renders DOM
git/status.ts parses output                                Handles keyboard input
fs.watch on .git/index                                     Sends action messages
```

### Extension → WebView Messages

- `{type: 'status', data: {branch, head, staged[], unstaged[], untracked[]}}` — full status update
- `{type: 'error', message: string}` — git error

### WebView → Extension Messages

- `{type: 'stage', files: string[]}` — stage files
- `{type: 'unstage', files: string[]}` — unstage files
- `{type: 'openFile', file: string}` — open file in editor
- `{type: 'openDiff', file: string}` — open diff
- `{type: 'refresh'}` — manual refresh

## Git Integration

- **Status:** `git status --porcelain=v2 --branch`
- **Stage:** `git add <file>`
- **Unstage:** `git restore --staged <file>`
- **Auto-refresh:** Watch `.git/index` for changes
- **Error handling:** Parse stderr, show in dashboard

## Testing Strategy

- Unit tests for git output parsing (porcelain v2 → typed objects)
- Integration tests for extension commands (VS Code test runner)
- No WebView tests in v1

## Deferred (post-v1)

- Inline diff / hunk staging
- Repo history (log) view
- Multi-root workspace support
- Stash and merge conflict sections
- VS Code keybinding system integration
- Discard changes action
