import { readFile } from 'node:fs/promises';
import { analyze } from '../../core.mjs';

const payload = JSON.parse(await readFile(process.argv[2], 'utf8'));
const events = Array.isArray(payload) ? payload : payload.events;
if (!Array.isArray(events)) throw Error('Expected an event array');
const report = analyze(events);
const seen = new Map();
const conflicts = new Set();
for (const event of events) {
  const signature = JSON.stringify([event.task_id, event.agent_id, event.status, event.occurred_at, event.duration_ms]);
  const previous = seen.get(event.event_id);
  if (previous && previous.signature !== signature) conflicts.add(event.event_id);
  if (!previous) seen.set(event.event_id, {signature, event});
}
const durations = [...seen.values()].map(item => item.event)
  .filter(e => !conflicts.has(e.event_id) && Number.isFinite(e.duration_ms) && e.duration_ms >= 0)
  .sort((a,b) => a.duration_ms - b.duration_ms);
function percentile(p) {
  if (!durations.length) return null;
  const rank = Math.ceil(p * durations.length);
  const witness = durations[rank - 1];
  return {milliseconds: witness.duration_ms, rank, event_id: witness.event_id, observationsAtOrAboveRank: durations.length-rank+1};
}
console.log(JSON.stringify({received: events.length, duplicateIds: report.duplicateEventIdCount,
  conflictingIds: [...conflicts], usableDurations: durations.length, p50: percentile(.5), p95: percentile(.95)}, null, 2));
