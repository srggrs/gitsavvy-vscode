export type FileStatusCode = 'M' | 'A' | 'D' | 'R' | 'C' | '?' | '!';

export interface FileStatus {
  path: string;
  statusCode: FileStatusCode;
  /** For renames: the original path */
  origPath?: string;
}

export interface RecentCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface RepoStatus {
  branch: string;
  head: string;
  headMessage: string;
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: FileStatus[];
  recentCommits: RecentCommit[];
}

/** Messages from extension to WebView */
export type ExtensionMessage =
  | { type: 'status'; data: RepoStatus }
  | { type: 'error'; message: string };

/** Messages from WebView to extension */
export type WebViewMessage =
  | { type: 'stage'; files: string[] }
  | { type: 'unstage'; files: string[] }
  | { type: 'openFile'; file: string }
  | { type: 'openDiff'; file: string }
  | { type: 'refresh' }
  | { type: 'commit' }
  | { type: 'push' };
