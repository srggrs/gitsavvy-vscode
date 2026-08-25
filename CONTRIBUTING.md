# Contributing to GitSavvy for VS Code

## Prerequisites

- Node.js 18+
- VS Code 1.85+
- Git

## Setup

```bash
git clone <repo-url>
cd gitsavvy-vscode
npm install
```

## Building

```bash
# One-time build
npm run compile

# Watch mode (rebuilds on changes)
npm run watch
```

## Running the Extension

1. Open the project in VS Code
2. Press **F5** to launch the Extension Development Host
3. In the new VS Code window, open a git repository
4. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
5. Run **"GitSavvy: Open Status Dashboard"**

The dashboard opens as an editor tab showing staged, unstaged, and untracked files.

### Keyboard Shortcuts (in the dashboard)

| Key                | Action         |
| ------------------ | -------------- |
| `j` / `k` / arrows | Navigate files |
| `s`                | Stage file     |
| `u`                | Unstage file   |
| `d`                | Open diff      |
| `Enter`            | Open file      |
| `Tab`              | Cycle sections |
| `r`                | Refresh        |

## Running Tests

```bash
# Compile TypeScript and run unit tests
npm run pretest && npm run test:unit

# Or directly:
npx tsc && npx mocha 'out/git/*.test.js' --timeout 10000 --ui tdd
```

## Project Structure

```text
src/
├── extension.ts              # Entry point, registers commands and providers
├── types.ts                  # Shared TypeScript types
├── git/
│   ├── cli.ts                # Git CLI wrapper (child_process.spawn)
│   ├── cli.test.ts           # CLI wrapper tests
│   ├── repo.ts               # High-level git operations (status, stage, unstage)
│   ├── repo.test.ts          # Repo integration tests
│   ├── status.ts             # Parses git status --porcelain=v2 output
│   └── status.test.ts        # Parser unit tests
└── views/
    ├── statusDashboard.ts    # Webview panel provider (dashboard lifecycle + message bridge)
    └── webview/
        ├── status.html       # HTML template (reference only)
        ├── status.css        # Dashboard styles (uses VS Code CSS variables)
        └── status.js         # Dashboard JS (keyboard nav, rendering, postMessage)
```
