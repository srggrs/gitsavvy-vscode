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

  test('checkoutNewBranch creates and switches to a new branch', async () => {
    await repo.checkoutNewBranch('feature/test');
    const status = await repo.getStatus();
    assert.strictEqual(status.branch, 'feature/test');
  });

  test('checkoutNewBranch throws for invalid branch name', async () => {
    await assert.rejects(
      () => repo.checkoutNewBranch('invalid..name'),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      }
    );
  });

  test('push throws when no remote is configured', async () => {
    await assert.rejects(
      () => repo.push(),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      }
    );
  });

  test('getStatus includes last 5 recent commits', async () => {
    for (let i = 1; i <= 6; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${i}.txt`), `content${i}`);
      await repo.stage([`file${i}.txt`]);
      await repo.commit(`commit number ${i}`);
    }
    const status = await repo.getStatus();
    assert.strictEqual(status.recentCommits.length, 5);
    assert.strictEqual(status.recentCommits[0].message, 'commit number 6');
    assert.strictEqual(status.recentCommits[4].message, 'commit number 2');
  });

  test('getStatus includes commit short hash and author', async () => {
    const status = await repo.getStatus();
    assert.ok(status.recentCommits.length >= 1);
    assert.match(status.recentCommits[0].hash, /^[0-9a-f]{7}$/);
    assert.strictEqual(status.recentCommits[0].author, 'Test');
  });
});
