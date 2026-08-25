# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile          # Build once (TypeScript → dist/extension.js via esbuild)
npm run watch            # Build in watch mode (for development)
npm run vscode:prepublish # Production build (minified)
npm run lint             # ESLint on src/
npm run test             # Integration tests via VS Code test runner
npm run test:unit        # Unit tests only (mocha on out/git/*.test.js)
npm run pretest          # tsc compile before testing (run automatically before test)
```

To run a single unit test file: `npx mocha out/git/status.test.js --timeout 10000`

## Architecture

This is a VS Code extension providing a keyboard-driven Git status dashboard (inspired by GitSavvy for Sublime Text).

**Extension → WebView communication:** `postMessage` with typed `ExtensionMessage` / `WebViewMessage` interfaces defined in `types.ts`. The extension sends `repoStatus` messages to update the UI; the webview sends action messages (`stage`, `unstage`, `commit`, `push`, `checkoutNewBranch`) back to the extension.

**Auto-refresh:** `statusDashboard.ts` watches `.git/` directory via `fs.watch` and refreshes the webview on changes, debounced at 200ms.

**Custom Editor:** The dashboard opens via `vscode.window.createWebviewPanel`, and can be revealed/reopened as a panel-based view.

### Layer responsibilities

| Layer | Files | Role |
|---|---|---|
| Entry point | `src/extension.ts` | Registers commands and the custom editor provider |
| Types | `src/types.ts` | Shared interfaces for data and message protocols |
| Git CLI | `src/git/cli.ts` | Raw `child_process.spawn` wrapper for git commands |
| Git operations | `src/git/repo.ts` | High-level API: getStatus, stage, unstage, commit, push, checkoutNewBranch |
| Git parsing | `src/git/status.ts` | Parses `git status --porcelain=v2` output into typed structs |
| UI provider | `src/views/statusDashboard.ts` | Webview panel provider, WebView lifecycle, message dispatch |
| WebView client | `src/views/webview/status.js` | Vanilla JS rendering, vim-style keyboard nav (j/k/Tab), click handling |
| WebView styles | `src/views/webview/status.css` | Styling using VS Code CSS variables for theme integration |

**Build output:** `src/extension.ts` is bundled into `dist/extension.js`. The `vscode` module is externalized (provided by VS Code runtime). The webview assets (`status.js`, `status.css`) are copied to `dist/` by `esbuild.js`.

**Testing:** Unit tests live in `src/git/*.test.ts` and compile to `out/git/`. Integration tests use `@vscode/test-cli` and `@vscode/test-electron`.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**CRITICAL: Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (90-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk vitest run          # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->
