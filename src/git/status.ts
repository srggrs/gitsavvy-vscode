import { FileStatus, FileStatusCode, RepoStatus } from '../types';

export function parseStatus(output: string): RepoStatus {
  const lines = output.split('\n');
  let branch = '';
  let head = '';
  const staged: FileStatus[] = [];
  const unstaged: FileStatus[] = [];
  const untracked: FileStatus[] = [];

  for (const line of lines) {
    if (!line) continue;

    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length);
      continue;
    }

    if (line.startsWith('# branch.oid ')) {
      head = line.slice('# branch.oid '.length).slice(0, 7);
      continue;
    }

    if (line.startsWith('#')) continue;

    // Untracked
    if (line.startsWith('? ')) {
      untracked.push({
        path: line.slice(2),
        statusCode: '?',
      });
      continue;
    }

    // Ordinary changed entry: 1 XY sub mH mI mW hH hI path
    if (line.startsWith('1 ')) {
      const xy = line.slice(2, 4);
      const rest = line.slice(5);
      // path is after the 7th space-separated field
      const parts = rest.split(' ');
      const path = parts.slice(6).join(' ');
      const stagedCode = xy[0];
      const unstagedCode = xy[1];

      if (stagedCode !== '.') {
        staged.push({ path, statusCode: stagedCode as FileStatusCode });
      }
      if (unstagedCode !== '.') {
        unstaged.push({ path, statusCode: unstagedCode as FileStatusCode });
      }
      continue;
    }

    // Renamed/copied entry: 2 XY sub mH mI mW hH hI Xscore path\torigPath
    if (line.startsWith('2 ')) {
      const xy = line.slice(2, 4);
      const rest = line.slice(5);
      const parts = rest.split(' ');
      const pathPart = parts.slice(7).join(' ');
      const [newPath, origPath] = pathPart.split('\t');
      const stagedCode = xy[0];
      const unstagedCode = xy[1];

      if (stagedCode !== '.') {
        staged.push({
          path: newPath,
          origPath,
          statusCode: stagedCode as FileStatusCode,
        });
      }
      if (unstagedCode !== '.') {
        unstaged.push({
          path: newPath,
          origPath,
          statusCode: unstagedCode as FileStatusCode,
        });
      }
      continue;
    }
  }

  return { branch, head, headMessage: '', staged, unstaged, untracked, recentCommits: [] };
}
