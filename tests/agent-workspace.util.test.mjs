import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCompleteTask,
  canDeleteSharedFile,
  canUploadToFolder,
} from '../dist/modules/agent-workspace/agent-workspace.util.js';

test('assignee can complete own task only', () => {
  assert.equal(canCompleteTask('emp_a', 'emp_a'), true);
  assert.equal(canCompleteTask('emp_a', 'emp_b'), false);
});

test('only folder owner can upload or delete', () => {
  assert.equal(canUploadToFolder('emp_a', 'emp_a'), true);
  assert.equal(canUploadToFolder('emp_a', 'emp_b'), false);
  assert.equal(canDeleteSharedFile('emp_a', 'emp_a'), true);
  assert.equal(canDeleteSharedFile('emp_a', 'emp_b'), false);
});
