import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitRepo } from './repo';

suite('GitRepo', () => {
  let tmpDir: string;
  let repo: GitRepo;

  setup(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitsavvy-test-'));
    repo = new GitRepo(tmpDir);
    const { cli } = repo;
    await cli.run('init');
    await cli.run('config', 'user.email', 'test@test.com');
    await cli.run('config', 'user.name', 'Test');
    // Create initial commit so HEAD exists
    fs.writeFileSync(path.join(tmpDir, '.gitkeep'), '');
    await cli.stage(['.gitkeep']);
    await cli.run('commit', '-m', 'initial');
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('getStatus returns branch and head', async () => {
    const status = await repo.getStatus();
    assert.strictEqual(status.branch, 'main');
    assert.ok(status.head.length === 7);
  });

  test('getStatus shows untracked files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'hello');
    const status = await repo.getStatus();
    assert.strictEqual(status.untracked.length, 1);
    assert.strictEqual(status.untracked[0].path, 'new.txt');
  });

  test('getStatus shows staged files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'staged.txt'), 'hello');
    await repo.cli.stage(['staged.txt']);
    const status = await repo.getStatus();
    assert.strictEqual(status.staged.length, 1);
    assert.strictEqual(status.staged[0].path, 'staged.txt');
  });

  test('getHeadMessage returns last commit message', async () => {
    const status = await repo.getStatus();
    assert.strictEqual(status.headMessage, 'initial');
  });

  test('commit creates a new commit with the given message', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'hello');
    await repo.stage(['file.txt']);
    await repo.commit('add file.txt');
    const status = await repo.getStatus();
    assert.strictEqual(status.staged.length, 0);
    assert.strictEqual(status.headMessage, 'add file.txt');
  });

  test('commit throws when nothing is staged', async () => {
    await assert.rejects(
      () => repo.commit('empty commit'),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      }
    );
  });
});
