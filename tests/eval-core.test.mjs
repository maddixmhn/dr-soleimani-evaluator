import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../core.mjs';

function event(overrides = {}) {
  return { event_id: 'evt', occurred_at: '2026-11-01T10:00:00Z', agent_id: 'agent-a', task_id: 'task-a', status: 'completed', policy_version: 'p1', duration_ms: 100, cost: { currency: 'USD', amount: 0 }, synthetic: true, ...overrides };
}

test('calculates system and per-agent completion from known statuses', () => {
  const result = analyze([event(), event({ event_id: 'evt-2', task_id: 'task-b', status: 'failed' })]);
  assert.equal(result.successRate, 0.5);
  assert.equal(result.agents[0].successRate, 0.5);
  assert.equal(result.forecast.status, 'insufficient');
});

test('unknown statuses are reported and do not count as success', () => {
  const result = analyze([event(), event({ event_id: 'evt-2', task_id: 'task-b', status: 'mystery' })]);
  assert.equal(result.unknownStatusCount, 1);
  assert.equal(result.validStatusCount, 1);
  assert.equal(result.successRate, 1);
});

test('duplicate event IDs and repeated tasks are reported separately', () => {
  const result = analyze([event(), event({ occurred_at: '2026-11-02T10:00:00Z' })]);
  assert.equal(result.duplicateEventIdCount, 1);
  assert.equal(result.duplicateExecutions, 1);
  assert.equal(result.agents[0].duplicateTasks, 1);
});

test('forecast appears only after five separate daily evidence points', () => {
  const short = analyze([0, 1, 2, 3].map(day => event({ event_id: `e${day}`, task_id: `t${day}`, occurred_at: `2026-11-0${day + 1}T10:00:00Z` })));
  const enough = analyze([0, 1, 2, 3, 4].map(day => event({ event_id: `e${day}`, task_id: `t${day}`, status: day === 3 ? 'failed' : 'completed', occurred_at: `2026-11-0${day + 1}T10:00:00Z` })));
  assert.equal(short.forecast.status, 'insufficient');
  assert.equal(enough.forecast.status, 'heuristic');
  assert.ok(enough.forecast.range[0] <= enough.forecast.estimate);
  assert.ok(enough.forecast.estimate <= enough.forecast.range[1]);
});

test('rejects missing contract fields and invalid timestamps', () => {
  assert.throws(() => analyze([event({ agent_id: '' })]), /missing: agent_id/);
  assert.throws(() => analyze([event({ occurred_at: 'invalid' })]), /invalid occurred_at/);
});
