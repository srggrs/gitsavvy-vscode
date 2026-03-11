import { GitCli } from './cli';
import { parseStatus } from './status';
import { RepoStatus } from '../types';

export class GitRepo {
  readonly cli: GitCli;

  constructor(private cwd: string) {
    this.cli = new GitCli(cwd);
  }

  async getStatus(): Promise<RepoStatus> {
    const result = await this.cli.run(
      'status',
      '--porcelain=v2',
      '--branch'
    );

    if (result.exitCode !== 0) {
      throw new Error(`git status failed: ${result.stderr}`);
    }

    const status = parseStatus(result.stdout);

    // Get HEAD commit message
    const logResult = await this.cli.run(
      'log',
      '-1',
      '--format=%s'
    );
    if (logResult.exitCode === 0) {
      status.headMessage = logResult.stdout.trim();
    }

    return status;
  }

  async stage(files: string[]): Promise<void> {
    const result = await this.cli.stage(files);
    if (result.exitCode !== 0) {
      throw new Error(`git add failed: ${result.stderr}`);
    }
  }

  async unstage(files: string[]): Promise<void> {
    const result = await this.cli.unstage(files);
    if (result.exitCode !== 0) {
      throw new Error(`git restore --staged failed: ${result.stderr}`);
    }
  }

  async commit(message: string): Promise<void> {
    const result = await this.cli.run('commit', '-m', message);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'git commit failed');
    }
  }

  async checkoutNewBranch(name: string): Promise<void> {
    const result = await this.cli.run('checkout', '-b', name);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'git checkout failed');
    }
  }

  async push(): Promise<void> {
    const result = await this.cli.run('push');
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'git push failed');
    }
  }
}
