const statuses = new Set(['completed', 'failed', 'blocked', 'cancelled']);

export function analyze(input) {
  const flags = [];
  const seen = new Set();
  const rows = input.map((event, index) => {
    if (!event || typeof event !== 'object') throw new Error(`event ${index + 1} must be an object`);
    const missing = ['event_id', 'occurred_at', 'agent_id', 'task_id', 'status'].filter(key => !event[key]);
    if (missing.length) throw new Error(`event ${index + 1} missing: ${missing.join(', ')}`);
    if (seen.has(event.event_id)) flags.push('duplicate_event_id');
    seen.add(event.event_id);
    if (!statuses.has(event.status)) flags.push('unknown_status');
    if (!event.policy_version) flags.push('missing_policy_version');
    const date = Date.parse(event.occurred_at);
    if (!Number.isFinite(date)) throw new Error(`invalid occurred_at: ${event.event_id}`);
    return { ...event, date };
  }).sort((a, b) => a.date - b.date);

  const known = rows.filter(event => statuses.has(event.status));
  const completed = known.filter(event => event.status === 'completed').length;
  const taskCounts = new Map();
  for (const event of rows) taskCounts.set(event.task_id, (taskCounts.get(event.task_id) || 0) + 1);
  const duplicateExecutions = [...taskCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const agents = new Map();
  for (const event of known) {
    if (!agents.has(event.agent_id)) agents.set(event.agent_id, []);
    agents.get(event.agent_id).push(event);
  }
  const byAgent = [...agents].map(([id, items]) => ({
    id, events: items.length,
    completed: items.filter(item => item.status === 'completed').length,
    failed: items.filter(item => item.status === 'failed').length,
    duplicateTasks: items.length - new Set(items.map(item => item.task_id)).size,
    averageDurationMs: items.filter(item => Number.isFinite(item.duration_ms)).length
      ? items.filter(item => Number.isFinite(item.duration_ms)).reduce((sum, item) => sum + item.duration_ms, 0) / items.filter(item => Number.isFinite(item.duration_ms)).length
      : null,
    cost: items.reduce((sum, item) => sum + (Number(item.cost?.amount) || 0), 0),
    currency: items.find(item => item.cost?.currency)?.cost.currency || null,
  })).map(item => ({ ...item, successRate: item.events ? item.completed / item.events : null,
    success: item.events ? item.completed / item.events : null, duplicates: item.duplicateTasks,
    avgDuration: item.averageDurationMs || 0 }));

  const daily = new Map();
  for (const event of known) {
    const day = new Date(event.date).toISOString().slice(0, 10);
    const point = daily.get(day) || { count: 0, completed: 0 };
    point.count++;
    if (event.status === 'completed') point.completed++;
    daily.set(day, point);
  }
  const series = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, point]) => ({ date, rate: point.completed / point.count }));
  let forecast = { status: 'insufficient', estimate: null, range: null, bounds: null, text: 'برای پیش‌بینی روند، دست‌کم پنج بازهٔ زمانی معتبر لازم است.' };
  if (series.length >= 5) {
    const tail = series.slice(-5).map(item => item.rate);
    const mean = tail.reduce((sum, value) => sum + value, 0) / tail.length;
    const slope = tail.reduce((sum, value, index) => sum + (index - 2) * (value - mean), 0) / 10;
    const estimate = Math.max(0, Math.min(1, tail[4] + slope));
    const spread = Math.sqrt(tail.reduce((sum, value) => sum + (value - mean) ** 2, 0) / tail.length);
    const range = [Math.max(0, estimate - spread), Math.min(1, estimate + spread)];
    forecast = { status: 'heuristic', estimate, range, bounds: range,
      text: `برآورد سادهٔ بازهٔ بعدی: ${Math.round(estimate * 100)}٪ تکمیل؛ دامنهٔ نوسان مشاهدات ${Math.round(range[0] * 100)}٪ تا ${Math.round(range[1] * 100)}٪ است. این پیش‌بینی آماری ساده، نه پیش‌بینی مدل و نه تضمین آینده است.` };
  }
  return {
    contract: 'dr-soleimani-report/1.0', evidenceCount: rows.length, evidence_count: rows.length,
    validStatusCount: known.length, valid_status_count: known.length,
    successRate: known.length ? completed / known.length : null, success_rate: known.length ? completed / known.length : null,
    duplicateExecutions, duplicate_executions: duplicateExecutions,
    duplicateRate: rows.length ? duplicateExecutions / rows.length : null, duplicate_rate: rows.length ? duplicateExecutions / rows.length : null,
    unknownStatusCount: flags.filter(flag => flag === 'unknown_status').length,
    unknown_status: flags.filter(flag => flag === 'unknown_status').length,
    duplicateEventIdCount: flags.filter(flag => flag === 'duplicate_event_id').length,
    duplicate_event_ids: flags.filter(flag => flag === 'duplicate_event_id').length,
    missingPolicyCount: flags.filter(flag => flag === 'missing_policy_version').length,
    missing_policy: flags.filter(flag => flag === 'missing_policy_version').length,
    synthetic: rows.every(event => event.synthetic === true), agents: byAgent,
    series: series.map(point => ({ ...point, value: point.rate })), forecast,
    method: 'Deterministic heuristic v1; unknown statuses excluded from success; no LLM inference.',
  };
}
