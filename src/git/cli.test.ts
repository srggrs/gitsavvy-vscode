import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitCli } from './cli';

suite('GitCli', () => {
  let tmpDir: string;
  let git: GitCli;

  setup(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsavvy-test-'));
    git = new GitCli(tmpDir);
    await git.run('init');
    await git.run('config', 'user.email', 'test@test.com');
    await git.run('config', 'user.name', 'Test');
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('run returns stdout from git command', async () => {
    const result = await git.run('status', '--porcelain');
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, '');
  });

  test('stage adds file to index', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');
    await git.stage(['test.txt']);
    const result = await git.run('status', '--porcelain');
    assert.ok(result.stdout.includes('A  test.txt'));
  });

  test('unstage removes file from index', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');
    await git.stage(['test.txt']);
    await git.run('commit', '-m', 'initial');
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'changed');
    await git.stage(['test.txt']);
    await git.unstage(['test.txt']);
    const result = await git.run('status', '--porcelain');
    assert.ok(result.stdout.includes(' M test.txt'));
  });
});
