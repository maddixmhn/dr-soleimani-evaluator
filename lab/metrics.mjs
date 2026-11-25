const MAX_ROWS = 50_000;
const MAX_COLUMNS = 200;
const SET_KEYS = ['events', 'records', 'rows', 'data', 'results', 'executions', 'stages', 'registrations'];
const STATUS = new Map([
  ...['completed', 'complete', 'success', 'succeeded', 'ok', 'passed'].map(s => [s, 'completed']),
  ...['failed', 'error', 'failure', 'crashed'].map(s => [s, 'failed']),
  ...['canceled', 'cancelled', 'blocked'].map(s => [s, s === 'canceled' ? 'cancelled' : s]),
  ...['running', 'waiting', 'queued', 'pending', 'new', 'scheduled'].map(s => [s, 'open']),
]);

export const FIELDS = {
  id: ['event_id', 'execution_id', 'execution', 'id', 'run_id'],
  agent: ['agent_id', 'role_id', 'agent', 'worker_id', 'actor', 'manager'],
  task: ['task_id', 'workflow_id', 'workflowId', 'task', 'name', 'activity'],
  status: ['status', 'state', 'outcome'],
  time: ['occurred_at', 'timestamp', 'finished_at', 'stoppedAt', 'ended'],
  queued: ['queued_at', 'submitted_at', 'submitted', 'queuedAt'],
  start: ['started_at', 'startedAt', 'started', 'start_time'],
  end: ['ended_at', 'finished_at', 'stoppedAt', 'ended', 'end_time'],
  duration: ['duration_ms', 'service_ms', 'execution_ms', 'runtime_ms', 'moodle_ms'],
  wait: ['queue_ms', 'wait_ms', 'redis_queue_ms', 'queue_wait_ms'],
  cost: ['cost.amount', 'cost_amount', 'cost'],
  currency: ['cost.currency', 'currency'],
};

function sets(value, name = '$', depth = 0) {
  if (Array.isArray(value)) return [{ name, rows: value }];
  if (!value || typeof value !== 'object') return [];
  if (depth >= 3) return [];
  const candidates = Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' && (SET_KEYS.includes(key) || Array.isArray(child) || depth < 2)
      ? sets(child, name + '.' + key, depth + 1) : []);
  if (candidates.length || depth) return candidates;
  return [{ name, rows: [value] }];
}

function normalizeRows(rows) {
  if (!rows.length) throw new Error('مجموعهٔ انتخاب‌شده خالی است.');
  if (rows.length > MAX_ROWS) throw new Error('حداکثر ۵۰٬۰۰۰ رکورد در هر مجموعه پذیرفته می‌شود.');
  if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('هر رکورد باید یک شیء یا ردیف دارای ستون باشد.');
  }
  const columns = new Set();
  const output = rows.map(value => {
    const row = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      row[key] = entry;
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        for (const [sub, nested] of Object.entries(entry)) {
          const name = key + '.' + sub;
          if (!Object.hasOwn(value, name)) row[name] = nested;
        }
      }
    }
    for (const key of Object.keys(row)) {
      if (row[key] == null || typeof row[key] !== 'object') columns.add(key);
      if (columns.size > MAX_COLUMNS) throw new Error('بیش از ۲۰۰ ستون قابل تحلیل در این مجموعه وجود دارد.');
    }
    return row;
  });
  return { rows: output, columns: [...columns] };
}

export function parseDataset(text, filename, csvParser) {
  const input = text.replace(/^\uFEFF/, '').trim();
  if (!input) throw new Error('فایل خالی است.');
  const ext = filename.split('.').at(-1).toLowerCase();
  if (['jsonl', 'ndjson'].includes(ext)) {
    const rows = input.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      try { return JSON.parse(line); } catch { throw new Error('JSON نامعتبر در رکورد ' + (index + 1)); }
    });
    return [{ name: 'رویدادهای خطی', rows }];
  }
  if (ext === 'json') return sets(JSON.parse(input));
  if (!['csv', 'tsv'].includes(ext)) throw new Error('پسوند فایل باید JSON، JSONL، NDJSON، CSV یا TSV باشد.');
  const result = csvParser.parse(input, {
    header: true, skipEmptyLines: 'greedy',
    delimitersToGuess: [',', '\t', ';', '|'],
    ...(ext === 'tsv' ? { delimiter: '\t' } : {}),
  });
  const errors = result.errors.filter(entry => entry.code !== 'UndetectableDelimiter');
  if (errors.length) throw new Error('ساختار جدولی نامعتبر است. رکورد ' + ((errors[0].row ?? 0) + 1) + ' را بررسی کنید.');
  if (Object.keys(result.meta.renamedHeaders || {}).length) throw new Error('نام ستون‌های CSV باید یکتا باشد.');
  return [{ name: 'ردیف‌های جدول', rows: result.data }];
}

export function prepareDataset(dataset) { return normalizeRows(dataset.rows); }
export function suggestMapping(columns) {
  const keys = new Map(columns.map(key => [key.trim().toLowerCase(), key]));
  return Object.fromEntries(Object.entries(FIELDS).map(([field, synonyms]) =>
    [field, synonyms.map(key => keys.get(key.toLowerCase())).find(Boolean) ?? '']));
}

function decimal(value) {
  if (typeof value === 'string') {
    const digits = value.trim().replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15)).replace('٫', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(digits)) return null;
    value = Number(digits);
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function timestamp(value) {
  if (typeof value === 'number') return Number.isFinite(new Date(value).valueOf()) ? value : null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T.+(?:Z|[+-]\d{2}:\d{2})$)/i.test(value)) return null;
  const day = value.slice(0, 10);
  const midnight = new Date(day);
  if (!Number.isFinite(midnight.valueOf()) || midnight.toISOString().slice(0, 10) !== day) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function nonnegative(value) {
  const number = decimal(value);
  return number !== null && number >= 0 ? number : null;
}

function timeDifference(from, to) {
  return from !== null && to !== null && to >= from ? to - from : null;
}

export function distribution(values) {
  if (!values.length) return { n: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const sorted = [...values].sort((a,b) => a-b);
  const rank = p => sorted[Math.ceil(p * sorted.length) - 1];
  return { n: sorted.length, min: sorted[0], p50: rank(.5), p95: rank(.95), p99: rank(.99),
    max: sorted.at(-1), mean: sorted.reduce((mean, value, index) => mean + (value - mean) / (index + 1), 0) };
}

function summarize(rows) {
  const status = Object.create(null);
  const durations = [], waits = [], metrics = [];
  const costs = new Map();
  for (const record of rows) {
    status[record.status] = (status[record.status] ?? 0) + 1;
    if (record.duration !== null) durations.push(record.duration);
    if (record.wait !== null) waits.push(record.wait);
    if (record.metric !== null) metrics.push(record.metric);
    if (record.cost !== null) {
      const key = record.currency || 'unspecified';
      costs.set(key, (costs.get(key) ?? 0) + record.cost);
    }
  }
  const closed = ['completed','failed','cancelled','blocked'].reduce((total, key) => total + (status[key] ?? 0), 0);
  return { rows: rows.length, status, closed, completionRate: closed ? (status.completed ?? 0) / closed : null,
    duration: distribution(durations), wait: distribution(waits), metric: distribution(metrics), costs: [...costs] };
}

export function evaluateRecords(rows, mapping, groupBy = 'agent') {
  const identified = new Map();
  const conflicts = new Set();
  const unidentified = [];
  let repeats = 0;
  for (const row of rows) {
    const get = key => mapping[key] ? row[mapping[key]] : undefined;
    const string = key => typeof get(key) === 'string' || typeof get(key) === 'number' ? String(get(key)).trim() : '';
    const start = timestamp(get('start')), end = timestamp(get('end')), queued = timestamp(get('queued'));
    const record = {
      id: string('id'), agent: string('agent'), task: string('task'),
      status: STATUS.get(string('status').toLowerCase()) ?? 'unknown',
      time: timestamp(get('time')) ?? end,
      duration: nonnegative(get('duration')) ?? timeDifference(start, end),
      wait: nonnegative(get('wait')) ?? timeDifference(queued, start),
      metric: decimal(get('metric')), cost: nonnegative(get('cost')), currency: string('currency').toUpperCase(),
    };
    if (!record.id) unidentified.push(record);
    else if (!identified.has(record.id)) identified.set(record.id, record);
    else if (JSON.stringify(identified.get(record.id)) === JSON.stringify(record)) repeats++;
    else conflicts.add(record.id);
  }
  const accepted = [...identified.values()].filter(record => !conflicts.has(record.id)).concat(unidentified);
  const groups = new Map();
  const days = new Map();
  let first = Infinity, last = -Infinity, dated = 0, datedClosed = 0;
  for (const row of accepted) {
    const key = row[groupBy] || '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    if (row.time === null) continue;
    const day = new Date(row.time).toISOString().slice(0, 10);
    days.set(day, (days.get(day) ?? 0) + 1);
    dated++;
    if (['completed','failed','cancelled','blocked'].includes(row.status)) datedClosed++;
    first = Math.min(first, row.time);
    last = Math.max(last, row.time);
  }
  return {
    input: rows.length, repeats, conflicts: [...conflicts], unidentified: unidentified.length,
    summary: summarize(accepted), dated, datedClosed,
    observationSeconds: last > first ? (last - first) / 1000 : null,
    daily: [...days].sort(([a], [b]) => a.localeCompare(b)),
    groups: [...groups].map(([key, records]) => ({ key, ...summarize(records) }))
      .sort((a,b) => b.rows - a.rows || a.key.localeCompare(b.key)),
  };
}
