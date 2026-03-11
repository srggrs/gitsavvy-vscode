import { spawn } from 'child_process';

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitCli {
  constructor(private cwd: string) {}

  async run(...args: string[]): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: this.cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
      });
      proc.on('error', reject);
    });
  }

  async stage(files: string[]): Promise<GitResult> {
    return this.run('add', '--', ...files);
  }

  async unstage(files: string[]): Promise<GitResult> {
    return this.run('restore', '--staged', '--', ...files);
  }
}
