import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCompleteTask,
  canDeleteSharedFile,
  canUploadToFolder,
  effectiveDayOfMonth,
  isoDateFromParts,
  isRecurringIssueToday,
} from '../dist/modules/agent-workspace/agent-workspace.util.js';

test('assignee can complete own task only', () => {
  assert.equal(canCompleteTask('emp_a', 'emp_a'), true);
  assert.equal(canCompleteTask('emp_a', 'emp_b'), false);
});

test('recurring calendar helpers clamp month-end', () => {
  assert.equal(effectiveDayOfMonth(2026, 2, 31), 28);
  assert.equal(isoDateFromParts(2026, 2, 31), '2026-02-28');
  assert.equal(isRecurringIssueToday(2026, 10, 25, 25), true);
  assert.equal(isRecurringIssueToday(2026, 10, 24, 25), false);
});

test('only folder owner can upload or delete', () => {
  assert.equal(canUploadToFolder('emp_a', 'emp_a'), true);
  assert.equal(canUploadToFolder('emp_a', 'emp_b'), false);
  assert.equal(canDeleteSharedFile('emp_a', 'emp_a'), true);
  assert.equal(canDeleteSharedFile('emp_a', 'emp_b'), false);
});
