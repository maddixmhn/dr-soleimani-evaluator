import { readFile } from 'node:fs/promises';

const trace = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (!trace.verified || trace.stages.length !== 3) throw Error('Incomplete registration trace');
const parts = [];
let previous;
for (const s of trace.stages) {
  const stamps = [s.submitted,s.started,s.ended];
  if (!stamps.every(Number.isSafeInteger) || s.started < s.submitted || s.ended < s.started || s.submitted < (previous?.ended ?? 0)) throw Error('Invalid timeline');
  if (previous) parts.push({from:previous.name,to:s.name,kind:'handoff',ms:s.submitted-previous.ended});
  parts.push({stage:s.name,kind:'dispatch-to-start',ms:s.started-s.submitted},{stage:s.name,kind:'service',ms:s.ended-s.started});
  previous=s;
}
const elapsed = parts.reduce((n,p)=>n+p.ms,0);
const largest = parts.reduce((a,b)=>a.ms>=b.ms?a:b);
console.log(JSON.stringify({task_id:trace.task_id,elapsed_ms:elapsed,parts,largest,share:elapsed?largest.ms/elapsed:null},null,2));
