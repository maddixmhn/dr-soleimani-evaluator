import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { evaluateQueue } from '../lab/queue-model.mjs';
import { fileURLToPath } from 'node:url';
import { distribution, evaluateRecords, prepareDataset, suggestMapping } from '../lab/metrics.mjs';

const sum = values => values.reduce((total, value) => total + value, 0);
const close = (value, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} differs from ${expected}`);
const evaluate = rows => {
  const data = prepareDataset({ rows });
  return evaluateRecords(data.rows, suggestMapping(data.columns), 'task');
};

test('1. Workload modeling: Amdahl speedup and the serial ceiling', () => {
  const syntheticStages = [20, 80];
  const parallelShare = syntheticStages[1] / sum(syntheticStages);
  const speedup = workers => 1 / (1 - parallelShare + parallelShare / workers);
  close(speedup(1), 1);
  close(speedup(4), 2.5);
  close(speedup(Infinity), 5);
});

test('1. Measured evidence: registration trace decomposes without inventing Redis queue time', () => {
  const input = new URL('../docs/registration-trace.json', import.meta.url);
  const trace = JSON.parse(readFileSync(input, 'utf8'));
  const result = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(new URL('../skills/performance-evaluation/trace.mjs', import.meta.url)),
    fileURLToPath(input),
  ], { encoding: 'utf8' }));
  assert.equal(result.elapsed_ms, trace.stages.at(-1).ended - trace.stages[0].submitted);
  assert.equal(result.elapsed_ms, 28633);
  assert.deepEqual(result.largest, { stage: 'n8n', kind: 'dispatch-to-start', ms: 14536 });
  const analysis = evaluate(trace.stages);
  assert.equal(analysis.summary.completionRate, null);
  assert.equal(analysis.groups.find(row => row.key === 'n8n').wait.mean, 14536);
  assert.equal(analysis.groups.find(row => row.key === 'n8n').duration.mean, 2617);
});

test('2. Little: independently integrate population and compare to admitted work × mean residence', () => {
  const jobs = [[0, 0, 3], [1, 3, 5], [4, 5, 6]];
  const queueOccupancy = [0, 1, 1, 0, 1, 0];
  const systemOccupancy = [1, 2, 2, 1, 2, 1];
  const report = evaluate(jobs.map(([submitted, started, ended]) => ({
    submitted: submitted * 1000, started: started * 1000, ended: ended * 1000,
  })));
  const throughput = jobs.length / 6;
  close(sum(queueOccupancy) / 6, throughput * report.summary.wait.mean / 1000);
  close(sum(systemOccupancy) / 6, throughput * (report.summary.duration.mean + report.summary.wait.mean) / 1000);
});

test('2. M/M/1: analytical waiting time agrees with seeded event simulation', t => {
  const lambda = 0.8, mu = 1.2, sampleCount = 50_000, burnIn = 2_000;
  let seed = 57126, arrival = 0, departure = 0;
  const exponential = rate => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return -Math.log((seed + 1) / 4294967297) / rate;
  };
  const rows = [];
  for (let i = 0; i < sampleCount + burnIn; i++) {
    arrival += exponential(lambda);
    const start = Math.max(arrival, departure), service = exponential(mu);
    departure = start + service;
    if (i >= burnIn) rows.push({ duration_ms: 1000 * service, wait_ms: 1000 * (start - arrival) });
  }
  const summary = evaluate(rows).summary;
  t.diagnostic(`observed wait=${(summary.wait.mean / 1000).toFixed(4)} s; service=${(summary.duration.mean / 1000).toFixed(4)} s`);
  close(summary.wait.mean / 1000, lambda / (mu * (mu - lambda)), 0.14);
  close(summary.duration.mean / 1000, 1 / mu, 0.02);
  close(1 / (mu - 0.99 * mu), 100 / mu);
});

test('3. Random variables: PMF, CDF, expected value, variance and a quantile by hand', () => {
  const support = [1, 1, 2, 3, 3, 3];
  const result = distribution(support);
  close(support.filter(x => x === 3).length / support.length, 1 / 2);
  close(support.filter(x => x <= 2).length / support.length, 1 / 2);
  close(result.mean, 13 / 6);
  close(sum(support.map(x => (x - result.mean) ** 2)) / support.length, 29 / 36);
  assert.equal(result.p50, 2);
  assert.equal(result.p95, 3);
});

test('4. DTMC: two-step transition and period-two counterexample', () => {
  const propagate = (p, matrix) => matrix[0].map((_, j) => sum(p.map((x, i) => x * matrix[i][j])));
  const p = [[.7, .3], [.2, .8]];
  const twice = propagate(propagate([1, 0], p), p);
  close(twice[0], .55);
  close(twice[1], .45);
  const stationary = propagate([.4, .6], p);
  stationary.forEach((entry, i) => close(entry, [.4, .6][i]));
  const periodic = [[0, 1], [1, 0]];
  assert.deepEqual(propagate([1, 0], periodic), [0, 1]);
  assert.deepEqual(propagate([0, 1], periodic), [1, 0]);
});

test('5. CTMC: generator balance and exponential holding time', () => {
  const q = [[-2, 2], [3, -3]], stationary = [.6, .4];
  q.forEach(row => close(sum(row), 0));
  q[0].forEach((_, j) => close(sum(stationary.map((x, i) => x * q[i][j])), 0));
  close((1 - Math.exp(-5)) * .4, .3973048212003658);
  close(Math.exp(-2 * 1.5) / Math.exp(-2), Math.exp(-1));
});

test('6. M/M/1/K: overload can be stable with finite capacity but loses arrivals', () => {
  const lambda = 4, mu = 2, capacity = 2;
  const weights = Array.from({ length: capacity + 1 }, (_, n) => (lambda / mu) ** n);
  const stationary = weights.map(weight => weight / sum(weights));
  const effectiveArrival = lambda * (1 - stationary.at(-1));
  close(stationary.at(-1), 4 / 7);
  close(effectiveArrival, 12 / 7);
  close(effectiveArrival, mu * (1 - stationary[0]));
  close(stationary[1] + 2 * stationary[2], 10 / 7);
});

test('7. M/M/2, infinite server, Erlang B, M/G/1 and priority models', () => {
  const lambda = 1, mu = 1, offeredLoad = lambda / mu;
  const idleTwo = 1 / (1 + offeredLoad + offeredLoad ** 2 / (2 * (1 - offeredLoad / 2)));
  const waitProbability = idleTwo * offeredLoad ** 2 / (2 * (1 - offeredLoad / 2));
  close(waitProbability, 1 / 3);
  close(1 / mu + waitProbability / (2 * mu - lambda), 4 / 3);
  close(Math.exp(-offeredLoad), 0.36787944117144233);
  const erlangB = offeredLoad ** 2 / 2 / (1 + offeredLoad + offeredLoad ** 2 / 2);
  close(erlangB, .2);
  const utilization = .5;
  close(utilization / (2 * (1 - utilization)), .5); // M/D/1 as M/G/1 with deterministic unit service.
  const highArrival = .2, lowArrival = .3;
  const highResponse = 1 / (1 - highArrival);
  const lowResponse = 1 / ((1 - highArrival) * (1 - highArrival - lowArrival));
  close(highResponse, 1.25);
  close(lowResponse, 2.5);
  close((highArrival * highResponse + lowArrival * lowResponse) / (highArrival + lowArrival), 2);
});

test('Advanced boundaries: absent metrics, 50,000 rows, and 200 columns', () => {
  assert.equal(distribution([]).mean, null);
  const rows = Array.from({ length: 50_000 }, (_, i) => ({ id: i, duration_ms: i, status: 'ok' }));
  const report = evaluate(rows);
  assert.equal(report.summary.rows, 50_000);
  assert.equal(report.summary.duration.p99, 49_499);
  assert.equal(report.summary.completionRate, 1);
  assert.throws(() => prepareDataset({ rows: [...rows, {}] }), /۵۰٬۰۰۰/);
  const columns = Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['c' + i, 0]));
  assert.equal(prepareDataset({ rows: [columns] }).columns.length, 200);
  assert.throws(() => prepareDataset({ rows: [{ ...columns, extra: 0 }] }), /۲۰۰/);
});

test('Advanced data quality: impossible Gregorian dates leave the observed timeline unchanged', () => {
  const report = evaluate([
    { id: 1, status: 'ok', timestamp: '2024-02-29T00:00:00Z' },
    { id: 2, status: 'ok', timestamp: '2024-02-29T00:00:02Z' },
    { id: 3, status: 'ok', timestamp: '2024-02-30T00:00:00Z' },
  ]);
  assert.equal(report.dated, 2);
  assert.equal(report.observationSeconds, 2);
  assert.equal(report.summary.rows, 3);
});

test('Advanced sweep: offered load from 0% to 125% for a finite queue', async t => {
  const capacity = 8, mu = 1;
  let lastBlocking = -1;
  for (let percent = 0; percent <= 125; percent++) {
    await t.test(percent + '% offered load', () => {
      const lambda = percent / 100;
      const weights = Array.from({ length: capacity + 1 }, (_, n) => lambda ** n);
      const p = weights.map(weight => weight / sum(weights));
      const expectedBlocking = p.at(-1);
      const { blocking, throughput } = evaluateQueue({ arrival: lambda, service: mu, servers: 1, capacity, threshold: 2 });
      close(blocking, expectedBlocking);
      close(throughput, lambda * (1 - expectedBlocking));
      close(sum(p), 1);
      close(lambda * (1 - blocking), mu * (1 - p[0]));
      assert.ok(blocking >= lastBlocking);
      if (percent === 0) assert.equal(blocking, 0);
      if (percent === 100) close(blocking, 1 / (capacity + 1));
      if (percent === 125) assert.ok(blocking > 0);
      lastBlocking = blocking;
    });
  }
});
