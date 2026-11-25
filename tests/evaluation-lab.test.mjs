import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseDataset, prepareDataset, suggestMapping, evaluateRecords } from '../lab/metrics.mjs';

const require = createRequire(import.meta.url);
const Papa = require('../lab/papaparse-5.7.0.js');
const prepare = (data, filename) => prepareDataset(parseDataset(data, filename, Papa)[0]);

test('CSV quoting, numeric values and queue wait stay independent', () => {
  const { rows, columns } = prepare([
    'execution_id,task,status,duration_ms,wait_ms',
    '1,"register, confirm",completed,۱۰,۰',
    '2,verify,failed,1000,5',
    '3,verify,running,20,',
  ].join('\n'), 'signals.csv');
  assert.equal(rows[0].task, 'register, confirm');
  const report = evaluateRecords(rows, suggestMapping(columns), 'task');
  assert.equal(report.summary.completionRate, .5);
  assert.equal(report.summary.duration.p95, 1000);
  assert.equal(report.summary.wait.n, 2);
  assert.equal(report.summary.wait.min, 0);
  assert.equal(report.summary.status.open, 1);
});

test('JSONL retransmissions and conflicting IDs are handled separately', () => {
  const { rows, columns } = prepare([
    { id:'ok', status:'ok', duration_ms:10 },
    { id:'ok', status:'ok', duration_ms:10 },
    { id:'conflict', status:'failed', duration_ms:20 },
    { id:'conflict', status:'completed', duration_ms:20 },
    { status:'unknown', duration_ms:-1 },
  ].map(row => JSON.stringify(row)).join('\n'), 'stream.ndjson');
  const report = evaluateRecords(rows, suggestMapping(columns));
  assert.deepEqual(report.conflicts, ['conflict']);
  assert.equal(report.repeats, 1);
  assert.equal(report.unidentified, 1);
  assert.equal(report.summary.duration.n, 1);
});

test('timestamps derive service and queue durations with no guessed values', () => {
  const sets = parseDataset('{"trace":{"stages":[{"name":"n8n","submitted":1000,"started":1010,"ended":1100}]}}','trace.json',Papa);
  assert.equal(sets[0].name, '$.trace.stages');
  const { rows, columns } = prepareDataset(sets[0]);
  const result = evaluateRecords(rows, suggestMapping(columns));
  assert.equal(result.summary.duration.p50, 90);
  assert.equal(result.summary.wait.p50, 10);
  assert.equal(result.summary.completionRate, null);
});

test('catalog contains 2,000 distinct design IDs and execution references', () => {
  const data = JSON.parse(readFileSync(new URL('../lab/catalog.json', import.meta.url)));
  assert.equal(data.records.length, 2000);
  assert.equal(new Set(data.records.map(r => r.agent_id)).size, 2000);
  assert.equal(new Set(data.records.map(r => r.execution)).size, 2000);
  assert.equal(Object.values(data.groups).reduce((sum, count) => sum + count, 0), 2000);
  assert.equal(data.records.every(record => record.synthetic === true), true);
  assert.equal(data.workflows.every(w => w.links.every(link => link.every(n => w.steps.includes(n)))), true);
});
