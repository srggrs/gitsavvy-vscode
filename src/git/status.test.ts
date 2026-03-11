import * as assert from 'assert';
import { parseStatus } from './status';

suite('parseStatus', () => {
  test('parses branch and head from porcelain v2', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '# branch.upstream origin/main',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.branch, 'main');
    assert.strictEqual(result.head, 'abc1234');
  });

  test('parses staged modified file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '1 M. N... 100644 100644 100644 abc1234 def5678 src/app.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 1);
    assert.strictEqual(result.staged[0].path, 'src/app.ts');
    assert.strictEqual(result.staged[0].statusCode, 'M');
  });

  test('parses unstaged modified file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '1 .M N... 100644 100644 100644 abc1234 def5678 src/index.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.unstaged.length, 1);
    assert.strictEqual(result.unstaged[0].path, 'src/index.ts');
    assert.strictEqual(result.unstaged[0].statusCode, 'M');
  });

  test('parses untracked file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '? README.md',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.untracked.length, 1);
    assert.strictEqual(result.untracked[0].path, 'README.md');
    assert.strictEqual(result.untracked[0].statusCode, '?');
  });

  test('parses staged added file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '1 A. N... 000000 100644 100644 0000000 abc1234 new-file.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 1);
    assert.strictEqual(result.staged[0].statusCode, 'A');
  });

  test('parses file that is both staged and unstaged', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '1 MM N... 100644 100644 100644 abc1234 def5678 src/both.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 1);
    assert.strictEqual(result.unstaged.length, 1);
    assert.strictEqual(result.staged[0].path, 'src/both.ts');
    assert.strictEqual(result.unstaged[0].path, 'src/both.ts');
  });

  test('parses renamed file', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
      '2 R. N... 100644 100644 100644 abc1234 def5678 R100 new.ts\told.ts',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 1);
    assert.strictEqual(result.staged[0].path, 'new.ts');
    assert.strictEqual(result.staged[0].origPath, 'old.ts');
    assert.strictEqual(result.staged[0].statusCode, 'R');
  });

  test('parses detached HEAD', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head (detached)',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.branch, '(detached)');
  });

  test('handles empty status', () => {
    const output = [
      '# branch.oid abc1234def5678',
      '# branch.head main',
    ].join('\n');

    const result = parseStatus(output);
    assert.strictEqual(result.staged.length, 0);
    assert.strictEqual(result.unstaged.length, 0);
    assert.strictEqual(result.untracked.length, 0);
  });
});
