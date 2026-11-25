import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateQueue, minimumServers } from '../lab/queue-model.mjs';

const solve = (options = {}) => evaluateQueue({ arrival: 0.8, service: 1, servers: 1, threshold: 2, ...options });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('M/M/1 matches the chapter formula and unconditional waiting tail', () => {
  const result = solve();
  close(result.waitingSeconds, 4);
  close(result.responseSeconds, 5);
  close(result.queueLength, 3.2);
  close(result.systemLength, 4);
  close(result.exceedance, 0.8 * Math.exp(-0.4));
});

test('M/M/2 and Erlang B compare two different admission policies', () => {
  const inputs = { arrival: 1, servers: 2 };
  const queue = solve(inputs);
  const loss = solve({ ...inputs, capacity: 2 });
  close(queue.waiting, 1 / 3);
  close(queue.responseSeconds, 4 / 3);
  close(loss.blocking, 0.2);
  close(loss.waitingSeconds, 0);
  close(loss.onTimeArrivalShare, 0.8);
});

test('finite queue conditions waiting on acceptance and uses the Erlang tail', () => {
  const result = solve({ arrival: 1, capacity: 3, threshold: 1 });
  close(result.blocking, 1 / 4);
  close(result.throughput, 3 / 4);
  close(result.waitingSeconds, 1);
  close(result.exceedance, Math.exp(-1));
  close(result.onTimeArrivalShare, .75 * (1 - Math.exp(-1)));
  close(result.systemLength, 1.5);
});

test('zero load, equality at saturation, and finite overload have distinct outcomes', () => {
  const zero = solve({ arrival: 0, capacity: 8 });
  close(zero.onTimeArrivalShare, 1);
  close(zero.responseSeconds, 1);
  assert.deepEqual(solve({ arrival: 1 }), { status: 'unstable', offeredUtilization: 1 });
  const overloaded = solve({ arrival: 1000000, service: 0.000001, servers: 100, capacity: 5000 });
  assert.ok(overloaded.throughput > 0 && overloaded.throughput < 0.000100001);
  assert.ok(overloaded.blocking > 0.99999999);
  assert.ok(Object.entries(overloaded).filter(([key]) => key !== 'status').every(([,value]) => Number.isFinite(value)));
});

test('invalid configuration is rejected before numerical calculation', () => {
  for (const config of [{ arrival: -1 }, { threshold: NaN }, { servers: 1.5 }, { servers: 3, capacity: 2 }]) {
    assert.throws(() => solve(config), RangeError);
  }
});

test('capacity sizing finds the minimum that meets the SLA', () => {
  const input = { arrival: .8, service: 1, threshold: 2, capacity: null };
  assert.equal(minimumServers(input, .95).servers, 2);
  assert.equal(minimumServers(input, .45).servers, 1);
  assert.equal(minimumServers({ ...input, capacity: 1 }, .95), null);
  assert.throws(() => minimumServers(input, 1.01), RangeError);
});
