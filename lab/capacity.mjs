import { evaluateQueue, minimumServers } from './queue-model.mjs';

const el = id => document.getElementById(id);
const form = el('queue-form');
const fmt = new Intl.NumberFormat('fa-IR', { maximumSignificantDigits: 5 });
const number = value => fmt.format(value);
const percent = value => number(value * 100) + '٪';
const metrics = [
  ['نسبت بار پیشنهادی به ظرفیت خدمت', 'offeredUtilization', percent],
  ['استفادهٔ واقعی از ظرفیت خدمت', 'utilization', percent],
  ['رد درخواست', 'blocking', percent],
  ['گذردهی پذیرفته‌شده (درخواست بر ثانیه)', 'throughput', number],
  ['میانگین تعداد در صف', 'queueLength', number],
  ['میانگین تعداد در کل سیستم', 'systemLength', number],
  ['میانگین انتظار (ثانیه)', 'waitingSeconds', number],
  ['میانگین پاسخ (ثانیه)', 'responseSeconds', number],
  ['عبور از آستانه در بین پذیرفته‌شده‌ها', 'exceedance', percent],
  ['پذیرش و شروع تا آستانه از کل ورودها', 'onTimeArrivalShare', percent],
];
let report;

function addRow(body, title, values) {
  const row = body.insertRow();
  const head = document.createElement('th');
  head.scope = 'row';
  head.textContent = title;
  row.append(head);
  for (const value of values) row.insertCell().textContent = value;
}

function plot(sensitivity, ceiling) {
  const canvas = el('queue-chart');
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const left = 65, right = width - 27, top = 23, bottom = height - 49;
  const x = arrival => left + arrival / ceiling * (right - left);
  const y = share => bottom - share * (bottom - top);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '16px Tahoma, sans-serif';
  ctx.fillStyle = '#36294d';
  ctx.strokeStyle = '#ddd5e8';
  ctx.lineWidth = 1;
  for (const fraction of [0, .25, .5, .75, 1]) {
    ctx.textAlign = 'right';
    ctx.fillText(percent(fraction), left - 9, y(fraction) + 5);
    ctx.beginPath();
    ctx.moveTo(left, y(fraction));
    ctx.lineTo(right, y(fraction));
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(number(fraction * ceiling), x(fraction * ceiling), bottom + 24);
  }
  for (const [key, color, dash] of [['baseline', '#56329c', []], ['alternative', '#086c65', [10, 6]]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.setLineDash(dash);
    ctx.beginPath();
    let drew = false;
    for (const point of sensitivity) {
      if (!Number.isFinite(point[key])) { drew = false; continue; }
      if (drew) ctx.lineTo(x(point.arrival), y(point[key]));
      else ctx.moveTo(x(point.arrival), y(point[key]));
      drew = true;
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function calculate(event) {
  event?.preventDefault();
  const status = el('queue-status');
  const data = new FormData(form);
  const val = name => Number(data.get(name));
  const arrival = val('arrival'), threshold = val('threshold'), target = val('target') / 100;
  const config = side => ({
    arrival, threshold, service: val('service' + side), servers: val('servers' + side),
    capacity: data.get('capacity' + side) === '' ? null : val('capacity' + side),
  });
  try {
    const baseline = config('A'), alternative = config('B');
    const results = [evaluateQueue(baseline), evaluateQueue(alternative)];
    const sizing = minimumServers(alternative, target);
    el('queue-sizing').textContent = sizing
      ? 'با نرخ خدمت هر سرور و ظرفیت کل طرح جایگزین، حداقل ' + number(sizing.servers)
        + ' خدمت‌دهنده برای رسیدن به هدف ' + percent(target) + ' لازم است.'
      : 'هدف ' + percent(target) + ' با نرخ خدمت هر سرور و ظرفیت کل طرح جایگزین در بازهٔ تعداد سرور مجاز به دست نمی‌آید.';
    const ceiling = Math.min(1e6, Math.max(arrival * 1.3, baseline.service * baseline.servers * 1.3,
      alternative.service * alternative.servers * 1.3));
    const sensitivity = Array.from({ length: 65 }, (_, i) => {
      const arrival = ceiling * (i / 64);
      return {
        arrival,
        baseline: evaluateQueue({ ...baseline, arrival }).onTimeArrivalShare ?? null,
        alternative: evaluateQueue({ ...alternative, arrival }).onTimeArrivalShare ?? null,
      };
    });
    const metricsBody = el('queue-metrics'), sensitivityBody = el('queue-sensitivity');
    metricsBody.replaceChildren();
    sensitivityBody.replaceChildren();
    addRow(metricsBody, 'وضعیت', results.map(result =>
      result.status === 'steady' ? 'دارای حالت پایدار' : 'اشباع و بدون حالت پایدار'));
    for (const [title, key, format] of metrics) {
      addRow(metricsBody, title, results.map(result => Number.isFinite(result[key]) ? format(result[key]) : '—'));
    }
    for (const point of sensitivity.filter((_, index) => index % 8 === 0)) {
      addRow(sensitivityBody, number(point.arrival), [point.baseline, point.alternative].map(
        value => value === null ? 'ناپایدار' : percent(value)));
    }
    el('queue-results').hidden = false;
    plot(sensitivity, ceiling);
    report = { schema: 'queue-capacity/v1', kind: 'analytical', inputs: { baseline, alternative, target }, results, sizing, sensitivity };
    el('queue-export').disabled = false;
    status.classList.remove('error');
    const [a, b] = results;
    status.textContent = a.status === 'steady' && b.status === 'steady'
      ? 'تغییر سهم پذیرش و شروع تا آستانه در طرح جایگزین: ' + number((b.onTimeArrivalShare - a.onTimeArrivalShare) * 100) + ' واحد درصد.'
      : 'برای طرح ناپایدار، جدول فقط نسبت بار به ظرفیت را گزارش می‌کند.';
  } catch (error) {
    report = undefined;
    el('queue-results').hidden = true;
    el('queue-export').disabled = true;
    status.classList.add('error');
    status.textContent = error.message;
  }
}

form.addEventListener('submit', calculate);
form.addEventListener('input', () => {
  report = undefined;
  el('queue-results').hidden = true;
  el('queue-export').disabled = true;
  el('queue-status').textContent = '';
});
el('queue-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  if (window.saveOnAndroid?.(blob, 'queue-capacity.json')) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'queue-capacity.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
calculate();
