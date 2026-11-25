import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
const web = new URL('./www/', import.meta.url);
await rm(web, { recursive: true, force: true });
await mkdir(web, { recursive: true });
const files = ['index.html', 'login.html', 'dashboard.html', 'style.css', 'app.js', 'core.mjs', 'semester/events.json', 'studio.css', 'studio.js', 'sw.js', 'manifest.webmanifest', 'icon.svg'];
files.push(
  'lab/index.html',
  'lab/lab.css',
  'lab/lab.mjs',
  'lab/metrics.mjs',
  'lab/capacity.html',
  'lab/capacity.css',
  'lab/capacity.mjs',
  'lab/queue-model.mjs',
  'lab/catalog.json',
  'lab/papaparse-5.7.0.js',
  'lab/PAPAPARSE-LICENSE.txt',
  'docs/ARTICLE.md',
  'docs/PROJECT-PLAN.md',
  'docs/QUICKSTART-FA.md',
  'docs/article.html',
  'docs/project-status.json',
  'docs/presentation.html',
  'docs/presentation.css',
  'docs/evaluation-presentation.pdf',
  'docs/verified-evaluation-lab.jpg',
  'docs/verified-organization.jpg',
  'docs/homelable-evidence.jpg',
  'docs/code-graph.json',
  'docs/docker-desktop.jpg',
  'docs/evaluation-article.pdf',
  'docs/evaluation-method.md',
  'docs/execution-evidence.json',
  'docs/execution-evidence.png',
  'docs/faculty-home.png',
  'docs/faculty-semester.png',
  'docs/n8n-execution-19.jpg',
  'docs/paperclip-console.png',
  'docs/registration-trace.json',
  'docs/semester-web.html',
  'docs/semester-web.json',
  'docs/semester-workflow.svg',
  'docs/seminar.html',
  'docs/service-graph.svg'
);
for (const file of files) {
  const target = new URL(file, web);
  await mkdir(new URL('.', target), { recursive: true });
  if (file.endsWith('.html')) {
    const content = await readFile(new URL(file, import.meta.url), 'utf8');
    const adapter = '<script src="/android-documents.js" defer></script>';
    await writeFile(target, content.includes('</body>') ? content.replace('</body>', adapter + '</body>') : content + adapter);
  } else {
    await cp(new URL(file, import.meta.url), target);
  }
}
await cp(new URL('./android-documents.js', import.meta.url), new URL('android-documents.js', web));
await cp(new URL('./topology/', import.meta.url), new URL('topology/', web), { recursive: true });
console.log('Android web assets synced.');
