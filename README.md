# GitSavvy for VS Code

A port of [GitSavvy](https://github.com/timbrel/GitSavvy) (Sublime Text) to Visual Studio Code. Keyboard-driven git integration with a plain-text status dashboard.

## Features

**Status Dashboard** — opens as an editor tab showing your repo's staged, unstaged, and untracked files in a Sublime GitSavvy-style layout:

```
BRANCH: main
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
s: stage  u: unstage  d: diff  Enter: open  r: refresh
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` / arrows | Navigate files |
| `s` | Stage file |
| `u` | Unstage file |
| `d` | Open VS Code diff |
| `Enter` | Open file |
| `Tab` | Cycle between sections |
| `r` | Refresh status |

### Auto-refresh

The dashboard automatically updates when the git index changes — staging or unstaging files from the terminal, other extensions, or any other tool is reflected immediately.

## Usage

1. Open a git repository in VS Code
2. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run **"GitSavvy: Open Status Dashboard"**

## Architecture

- **Vanilla WebView** — plain HTML/CSS/JS, no framework. Uses VS Code CSS variables for native theming.
- **Git CLI** — all git operations via `child_process.spawn` (same approach as the original GitSavvy).
- **Custom Editor Tab** — the dashboard opens as a `CustomReadonlyEditorProvider`, so it behaves like a document tab (can be split, pinned, rearranged).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, building, testing, and project structure.

## License

MIT
