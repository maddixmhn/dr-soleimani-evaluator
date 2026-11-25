import { FIELDS, evaluateRecords, parseDataset, prepareDataset, suggestMapping } from './metrics.mjs';

const el = id => document.getElementById(id);
const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 3 });
const value = number => number == null || !Number.isFinite(number) ? '—' : fa.format(number);
const labels = {
  id: 'شناسهٔ یکتای رویداد', agent: 'ایجنت یا نقش', task: 'تسک یا مرحله', status: 'وضعیت',
  time: 'زمان رویداد', queued: 'ورود به صف', start: 'شروع اجرا', end: 'پایان اجرا',
  duration: 'مدت اجرا (ms)', wait: 'انتظار (ms)', metric: 'ستون عددی دلخواه', cost: 'هزینه', currency: 'واحد هزینه',
};
const managers = { ceo: 'مدیریت ارشد', pm: 'آموزش', cto: 'فناوری اطلاعات', engineer: 'مهندسی کامپیوتر' };
const statuses = { completed: 'تکمیل', failed: 'خطا', cancelled: 'لغو', blocked: 'مسدود', open: 'باز', unknown: 'نامشخص' };
const PAGE = 24;
const maxBytes = 8 * 1024 * 1024;
const taskKey = 'evaluator-local-assignments-v1';
let datasets = [], prepared, report, sourceName = '', groupPage = 0;
let catalogPromise, catalog, activeManager = '', rolePage = 0, currentRole = '';
let tasks = [];

function node(tag, text = '', className = '') {
  const item = document.createElement(tag);
  item.textContent = text;
  if (className) item.className = className;
  return item;
}
function msg(id, text, error = false) {
  el(id).textContent = text;
  el(id).classList.toggle('error', error);
}
function option(text, key) { return new Option(text, key); }
function row(values) {
  const tr = node('tr');
  values.forEach(item => tr.append(node('td', String(item))));
  return tr;
}
function meta(title, entry) {
  const card = node('div', '', 'kpi');
  card.append(node('span', title), node('strong', entry));
  return card;
}
function currentCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch('./catalog.json').then(response => {
      if (!response.ok) throw new Error('فهرست دانشگاه در دسترس نیست.');
      return response.json();
    }).then(data => {
      if (data.schema !== 'faran-role-catalog/1' || data.records.length !== 2000) {
        throw new Error('فهرست نقش‌ها ناقص است.');
      }
      return data;
    }).catch(error => { catalogPromise = undefined; throw error; });
  }
  return catalogPromise;
}

function setDataset(index) {
  prepared = prepareDataset(datasets[index]);
  const mapping = suggestMapping(prepared.columns);
  el('mapping').replaceChildren(...[...Object.keys(FIELDS), 'metric'].map(key => {
    const label = node('label', labels[key]);
    const select = node('select');
    select.id = 'column-' + key;
    select.append(option('— انتخاب نشده —', ''), ...prepared.columns.map(name => option(name, name)));
    select.value = mapping[key] || '';
    label.append(select);
    return label;
  }));
  const recognized = Object.values(mapping).filter(Boolean).length;
  el('mapping-box').open = recognized === 0;
  el('prepare').hidden = false;
  el('calculate').disabled = false;
  msg('load-status', value(prepared.rows.length) + ' رکورد آمادهٔ محاسبه · ' + sourceName);
}

function load(choices, title, begin = false) {
  if (!choices.length) throw new Error('هیچ مجموعهٔ رکوردی پیدا نشد.');
  sourceName = title;
  datasets = choices;
  const selector = el('recordset');
  selector.replaceChildren(...datasets.map(({ name, rows }, i) => option(name + ' · ' + value(rows.length), i)));
  const index = datasets.findIndex(set => set.rows.length);
  selector.value = String(Math.max(index, 0));
  setDataset(Number(selector.value));
  if (begin) calculate();
}

function calculate() {
  const mapping = Object.fromEntries([...el('mapping').querySelectorAll('select')].map(select => [select.id.slice(7), select.value]));
  if (!Object.values(mapping).some(Boolean)) {
    el('mapping-box').open = true;
    msg('load-status', 'برای این داده دست‌کم یک ستون را نگاشت کنید.', true);
    return;
  }
  const groupBy = el('group-by').value;
  report = { ...evaluateRecords(prepared.rows, mapping, groupBy), mapping, groupBy,
    source: sourceName, recordset: datasets[Number(el('recordset').value)].name };
  groupPage = 0;
  renderReport();
}

function drawGroupRows() {
  const groups = report.groups;
  const slice = groups.slice(groupPage * PAGE, (groupPage + 1) * PAGE);
  el('group-rows').replaceChildren(...slice.map(g => row([
    statuses[g.key] && report.groupBy === 'status' ? statuses[g.key] : g.key,
    value(g.rows), value(g.status.completed ?? 0), value(g.status.failed ?? 0), value(g.duration.p95), value(g.wait.p95),
  ])));
  pager('group', groupPage, groups.length);
}
function pager(prefix, index, total) {
  const max = Math.max(1, Math.ceil(total / PAGE));
  el(prefix + '-prev').disabled = index < 1;
  el(prefix + '-next').disabled = index + 1 >= max;
  el(prefix + '-page').textContent = 'صفحهٔ ' + value(index + 1) + ' از ' + value(max) + ' · ' + value(total);
}
function renderReport() {
  const { summary: s, repeats, conflicts, unidentified, input, dated, observationSeconds } = report;
  const ratio = s.completionRate == null ? '—' : value(100 * s.completionRate) + '٪';
  el('kpis').replaceChildren(meta('رکوردهای تحلیل‌شده', value(s.rows)), meta('نرخ تکمیل', ratio),
    meta('P95 اجرای ثبت‌شده (ms)', value(s.duration.p95)), meta('P95 انتظار ثبت‌شده (ms)', value(s.wait.p95)),
    meta('نرخ ثبت بر ثانیه', observationSeconds ? value(dated / observationSeconds) : '—'));
  const quality = [
    'ورودی ' + value(input), 'تکرار کنارگذاشته‌شده ' + value(repeats), 'شناسهٔ متناقض ' + value(conflicts.length),
    'بی‌شناسه ' + value(unidentified), 'زمان‌دار ' + value(dated), 'نهایی ' + value(s.closed),
    'وضعیت نامشخص ' + value(s.status.unknown ?? 0),
  ];
  el('quality').textContent = quality.join(' · ');
  const measures = [['اجرای ثبت‌شده (ms)', s.duration], ['انتظار ثبت‌شده (ms)', s.wait]];
  if (report.mapping.metric) measures.push([report.mapping.metric, s.metric]);
  el('distribution').replaceChildren(...measures.map(([title, detail]) =>
    row([title, value(detail.n), value(detail.p50), value(detail.p95), value(detail.p99), value(detail.mean)])));
  el('costs').replaceChildren(...s.costs.map(([currency, sum]) =>
    node('li', 'هزینهٔ ثبت‌شده: ' + value(sum) + ' ' + (currency === 'unspecified' ? 'واحد نامشخص' : currency))));
  drawGroupRows();
  el('results').hidden = false;
}

async function operation(action) {
  const controls = ['file', 'archived', 'sample-trace'].map(el);
  controls.forEach(control => { control.disabled = true; });
  report = null;
  el('results').hidden = true;
  el('prepare').hidden = true;
  msg('load-status', 'در حال خواندن…');
  try { await action(); } catch (error) { msg('load-status', error.message, true); }
  finally { controls.forEach(control => { control.disabled = false; }); }
}

el('file').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  void operation(async () => {
    if (file.size > maxBytes) throw new Error('حجم فایل از ۸ مگابایت بیشتر است.');
    load(parseDataset(await file.text(), file.name, window.Papa), file.name);
  });
});
el('archived').onclick = () => operation(async () => {
  const data = await currentCatalog();
  load([{ name: 'دفتر اجرا', rows: data.records }], 'آزمایش محلی با دادهٔ ساختگی · ' + data.evidenceDate, true);
});
el('sample-trace').onclick = () => operation(async () => {
  const response = await fetch('/docs/registration-trace.json');
  if (!response.ok) throw new Error('نمونهٔ ثبت‌نام در دسترس نیست.');
  const data = await response.json();
  el('group-by').value = 'task';
  load([{name:'مراحل ثبت‌نام', rows: data.stages}], 'رد ثبت‌نام · ' + data.task_id, true);
});
el('recordset').onchange = () => {
  report = null;
  el('results').hidden = true;
  try { setDataset(Number(el('recordset').value)); } catch (error) {
    prepared = null;
    el('calculate').disabled = true;
    msg('load-status', error.message, true);
  }
  if (prepared) el('calculate').disabled = false;
};
el('calculate').onclick = calculate;
el('group-prev').onclick = () => { groupPage--; drawGroupRows(); };
el('group-next').onclick = () => { groupPage++; drawGroupRows(); };

function save(data, name, type = 'application/json') {
  const blob = new Blob([type === 'application/json' ? JSON.stringify(data, null, 2) : data], {type});
  if (window.saveOnAndroid?.(blob, name)) return;
  const url = URL.createObjectURL(blob);
  const anchor = node('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
el('export-json').onclick = () => save({ schema: 'evaluator-calculator/1', ...report }, 'evaluation-report.json');
el('export-csv').onclick = () => {
  const flat = report.groups.map(g => ({ key: g.key, records: g.rows, completed: g.status.completed ?? 0,
    failed: g.status.failed ?? 0, duration_p95_ms: g.duration.p95, wait_p95_ms: g.wait.p95 }));
  save('\uFEFF' + window.Papa.unparse(flat, {escapeFormulae:true}), 'evaluation-groups.csv', 'text/csv');
};
el('print').onclick = () => window.print();

function branch(key, name, count) {
  const button = node('button', name + ' · ' + value(count));
  button.setAttribute('aria-pressed', String(activeManager === key));
  button.onclick = () => { activeManager = key; rolePage = 0; renderRoles(); };
  return button;
}
function renderRoles() {
  const phrase = el('role-query').value.trim().toLowerCase();
  const roles = catalog.records.filter(role => (!activeManager || role.manager === activeManager) &&
    (!phrase || [role.agent_id, role.task_id, role.execution].some(text => String(text).toLowerCase().includes(phrase))));
  el('branches').replaceChildren(branch('', 'همهٔ نقش‌ها', catalog.records.length),
    ...Object.entries(managers).map(([key, name]) => branch(key, name, catalog.groups[key])));
  const elements = roles.slice(rolePage * PAGE, (rolePage + 1) * PAGE).map(role => {
    const button = node('button', role.agent_id);
    button.append(node('small', 'اجرای ' + role.execution));
    button.setAttribute('aria-pressed', String(currentRole === role.agent_id));
    button.onclick = () => { currentRole = role.agent_id; openRole(role); renderRoles(); };
    return button;
  });
  el('role-nodes').replaceChildren(...(elements.length ? elements : [node('p', 'نقشی با این فیلتر پیدا نشد.')]));
  pager('role', rolePage, roles.length);
}
function openRole(role) {
  const detail = el('role-detail'), list = node('dl');
  for (const [key, entry] of [
    ['نقش', role.agent_id], ['واحد', managers[role.manager]], ['تسک ثبت‌شده', role.task_id],
    ['اجرای n8n', role.execution], ['نتیجهٔ آرشیو', statuses[role.status] ?? role.status], ['زمان ثبت', role.occurred_at],
  ]) list.append(node('dt', key), node('dd', entry));
  const assign = node('button', 'تخصیص تسک به این نقش');
  assign.onclick = () => { el('task-role').value = role.agent_id; el('task-title').focus(); };
  detail.replaceChildren(list, assign);
  detail.hidden = false;
}

function showWorkflow() {
  const workflow = catalog.workflows[Number(el('workflow').value)];
  el('steps').replaceChildren(...workflow.steps.map((name, i) => node('span', value(i + 1) + ' · ' + name)));
  el('step-links').textContent = workflow.links.map(([source, target]) => source + ' ← ' + target).join(' · ');
}
function loadTasks() {
  try {
    const list = JSON.parse(localStorage.getItem(taskKey) ?? '[]');
    if (Array.isArray(list)) tasks = list.filter(task => task && typeof task.title === 'string' && typeof task.id === 'string');
  } catch { tasks = []; }
  showTasks();
}
function persistTasks(next) {
  try { localStorage.setItem(taskKey, JSON.stringify(next)); }
  catch { msg('task-status', 'ذخیرهٔ مرورگر در دسترس نیست.', true); return; }
  tasks = next;
  showTasks();
  msg('task-status', 'دفتر تخصیص روی همین دستگاه ذخیره شد.');
}
function showTasks() {
  el('task-list').replaceChildren(...tasks.map(task => {
    const item = node('div', '', 'task-row');
    item.append(node('strong', task.title), node('small', ' · ' + task.agent_id + ' · ' + task.workflow));
    const remove = node('button', 'حذف');
    remove.setAttribute('aria-label', 'حذف تخصیص ' + task.title);
    remove.onclick = () => persistTasks(tasks.filter(entry => entry.id !== task.id));
    item.append(remove);
    return item;
  }));
  el('export-tasks').disabled = tasks.length === 0;
}

el('role-query').oninput = () => { rolePage = 0; renderRoles(); };
el('role-prev').onclick = () => { rolePage--; renderRoles(); };
el('role-next').onclick = () => { rolePage++; renderRoles(); };
el('workflow').onchange = showWorkflow;
el('task-form').onsubmit = event => {
  event.preventDefault();
  if (!catalog) { msg('task-status', 'ابتدا فهرست نقش‌ها را بارگذاری کنید.', true); return; }
  const agent = el('task-role').value.trim().toLowerCase(), title = el('task-title').value.trim();
  if (!title || !catalog.records.some(role => role.agent_id === agent)) {
    msg('task-status', 'عنوان و یکی از شناسه‌های فهرست نقش‌ها را وارد کنید.', true);
    return;
  }
  if (tasks.length >= 1000) { msg('task-status', 'گنجایش دفتر محلی ۱۰۰۰ تخصیص است.', true); return; }
  const next = { id: crypto.randomUUID(), agent_id: agent, title, workflow: catalog.workflows[Number(el('workflow').value)].name,
    status: 'planned', created_at: new Date().toISOString() };
  persistTasks([next, ...tasks]);
  if (tasks[0]?.id === next.id) el('task-title').value = '';
};
el('export-tasks').onclick = () => save({ schema: 'evaluator-task-assignments/1', assignments: tasks }, 'evaluation-tasks.json');

async function showUniversity() {
  if (catalog) return;
  try {
    catalog = await currentCatalog();
    const recorded = catalog.records.filter(r => r.execution).length;
    msg('catalog-status', value(catalog.records.length) + ' نقش طراحی‌شده · ' + value(recorded) +
      ' اجرای بایگانی‌شده با دادهٔ ساختگی · ' + catalog.evidenceDate);
    el('workflow').replaceChildren(...catalog.workflows.map(({ name }, i) => option(name, i)));
    renderRoles();
    showWorkflow();
    loadTasks();
  } catch (error) { msg('catalog-status', error.message + ' بخش را دوباره باز کنید.', true); }
}
function showTab(university) {
  el('calculator').hidden = university;
  el('university').hidden = !university;
  el('show-calculator').setAttribute('aria-pressed', String(!university));
  el('show-university').setAttribute('aria-pressed', String(university));
  history.replaceState(null, '', university ? '#university' : '#calculator');
  if (university) void showUniversity();
}
el('show-calculator').onclick = () => showTab(false);
el('show-university').onclick = () => showTab(true);
showTab(location.hash === '#university');
