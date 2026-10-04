import { LABELS, moduleHasContent, type Resume, type ModuleId } from './schema';
export const TEMPLATES = [
  { id: 'simple', name: '简洁单栏', description: '清晰克制，适合通用投递' },
  { id: 'business', name: '商务单栏', description: '鲜明层次，突出经历与贡献' },
  { id: 'campus', name: '校园双栏', description: '侧栏资料，主栏展示经历' }
] as const;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const join = (values: string[], separator = ' · ') => values.filter(v => v.trim()).map(escape).join(separator);
const dates = (start: string, end: string, current: boolean, estimated = false) => join([start, end ? (current && estimated ? end + '（预计）' : end) : current ? '至今' : ''], ' — ');
export const PRINT_CSS = [
  '@page { size: A4; margin: 14mm 14mm 15mm; }',
  '* { box-sizing: border-box; } html { background: white; color: #25313b; }',
  'body { margin: 0; font-family: "Microsoft YaHei", "Noto Sans CJK SC", "SimSun", sans-serif; font-size: 10.5pt; line-height: 1.65; }',
  '.sheet { padding: 0; overflow-wrap: anywhere; word-break: normal; }',
  '.resume-head { border-bottom: 2px solid var(--accent); padding-bottom: 13px; margin-bottom: 17px; }',
  'h1 { font-size: 25pt; margin: 0 0 2px; letter-spacing: 1px; line-height: 1.4; color: #152a32; }',
  '.target { color: var(--accent); font-size: 12pt; font-weight: 600; }',
  '.contacts { font-size: 9.5pt; color: #52616b; margin-top: 6px; white-space: pre-wrap; }',
  '.photo { float: right; width: 23mm; height: 29mm; object-fit: contain; margin: 0 0 8px 16px; }',
  '.resume-head::after { content: ""; display: block; clear: both; }',
  'h2 { margin: 17px 0 8px; font-size: 12pt; line-height: 1.6; color: var(--accent); border-bottom: 1px solid #d4dfdc; break-after: avoid-page; page-break-after: avoid; }',
  'h3 { display: flex; gap: 8px; align-items: baseline; font-size: 10.8pt; font-weight: 700; margin: 0; line-height: 1.6; break-after: avoid-page; }',
  '.entry { margin: 0 0 11px; } .entry-meta { color: #52616b; font-size: 9.5pt; margin: 2px 0 4px; break-after: avoid-page; }',
  '.date { color: #65747c; font-size: 9pt; margin-left: auto; flex-shrink: 0; max-width: 40%; text-align: right; }',
  'p { margin: 3px 0 7px; white-space: pre-wrap; orphans: 3; widows: 3; }',
  'ul { margin: 4px 0 8px; padding-left: 17px; } li { margin: 2px 0; white-space: pre-wrap; orphans: 3; widows: 3; }',
  '.short-entry { break-inside: avoid-page; page-break-inside: avoid; }',
  '.business .resume-head { border-bottom-width: 4px; } .business h2 { border-bottom: 0; border-left: 3px solid var(--accent); padding: 3px 0 3px 10px; background: #f3f6f6; }',
  '.campus .columns { display: table; width: 100%; table-layout: fixed; } .campus .side, .campus .main-column { display: table-cell; vertical-align: top; }',
  '.campus .side { width: 29%; padding-right: 15px; border-right: 1px solid #d4dfdc; } .campus .main-column { padding-left: 20px; }',
  '.campus .side h3 { display: block; } .campus .side .date { text-align: left; max-width: none; display: block; padding-left: 0; } .campus .side .photo { float: none; margin: 0 0 8px; max-width: 100%; } .campus .side h2:first-child, .campus .main-column h2:first-child { margin-top: 0; }',
  '@media screen { body { width: 210mm; min-height: 297mm; padding: 14mm; } }',
  '@media print { html, body { width: auto; min-height: 0; padding: 0; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }'
].join('\n');
function moduleHtml(r: Resume, module: ModuleId): string {
  if (!moduleHasContent(r, module)) return '';
  let content = '';
  const entry = (name: string, date: string, meta: string, body: string, short: boolean) =>
    '<article class="entry' + (short ? ' short-entry' : '') + '"><h3><span>' + escape(name) + '</span><span class="date">' + date + '</span></h3>' + (meta ? '<div class="entry-meta">' + meta + '</div>' : '') + body + '</article>';
  if (module === 'summary') content = '<p>' + escape(r.summary) + '</p>';
  else if (module === 'education') content = r.education.filter(e => e.visible && [e.school, e.major, e.degree, e.courses].some(v => v.trim())).map(e => {
    const details = join([e.gpa ? 'GPA：' + e.gpa + ' / ' + e.gpaMax : '', e.score ? '百分制成绩：' + e.score : '', e.rank ? '排名：' + e.rank : '']);
    return entry(e.school, dates(e.start, e.end, e.current, true), join([e.degree, e.major]), (details ? '<p>' + details + '</p>' : '') + (e.courses ? '<p>相关课程：' + escape(e.courses) + '</p>' : ''), e.courses.length < 350);
  }).join('');
  else if (module === 'awards') content = r.awards.filter(e => e.visible && (e.name.trim() || e.description.trim())).map(e => entry(e.name, escape(e.date), join([e.organization, e.level]), e.description ? '<p>' + escape(e.description) + '</p>' : '', e.description.length < 350)).join('');
  else if (module === 'skills') content = r.skills.filter(e => e.visible && (e.name.trim() || e.detail.trim())).map(e => entry(e.name, '', escape(e.category), e.detail ? '<p>' + escape(e.detail) + '</p>' : '', e.detail.length < 350)).join('');
  else content = r.experiences.filter(e => e.kind === module && e.visible && [e.name, e.organization, e.role, ...e.bullets.map(b => b.text)].some(v => v.trim())).map(e => {
    const bullets = e.bullets.filter(b => b.text.trim());
    return entry(e.name, dates(e.start, e.end, e.current), join([e.organization, e.role, e.tools]), bullets.length ? '<ul>' + bullets.map(b => '<li>' + escape(b.text) + '</li>').join('') + '</ul>' : '', bullets.reduce((n, b) => n + b.text.length, 0) + e.tools.length < (r.display.template === 'campus' ? 350 : 650));
  }).join('');
  return '<section class="resume-section"><h2>' + LABELS[module] + '</h2>' + content + '</section>';
}
export function resumeHtml(r: Resume): string {
  const photo = r.display.showPhoto && r.basics.photo ? '<img class="photo" alt="个人照片" src="' + escape(r.basics.photo.dataUrl) + '"/>' : '';
  const contacts = join([r.basics.phone, r.basics.email, r.basics.city, r.basics.website]);
  let head = '<header class="resume-head">' + photo + '<h1>' + escape(r.basics.name || '你的姓名') + '</h1>' + (r.target.role ? '<div class="target">' + escape(r.target.role) + '</div>' : '') + '<div class="contacts">' + contacts + '</div></header>';
  let body = r.display.order.map(m => moduleHtml(r, m)).join('');
  if (r.display.template === 'campus') {
    const side = new Set<ModuleId>(['summary', 'skills', 'awards']);
    head = '<header class="resume-head"><h1>' + escape(r.basics.name || '你的姓名') + '</h1>' + (r.target.role ? '<div class="target">' + escape(r.target.role) + '</div>' : '') + '</header>';
    body = '<div class="columns"><aside class="side">' + ('<section class="resume-section"><h2>个人资料</h2>' + photo + '<p class="contacts">' + join([r.basics.phone, r.basics.email, r.basics.city, r.basics.website], '\n') + '</p></section>') + r.display.order.filter(m => side.has(m)).map(m => moduleHtml(r, m)).join('') + '</aside><main class="main-column">' + r.display.order.filter(m => !side.has(m)).map(m => moduleHtml(r, m)).join('') + '</main></div>';
  }
  return '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'"/><title>简历</title><style>' + PRINT_CSS + '</style></head><body><div class="sheet ' + r.display.template + '" style="--accent:' + r.display.color + '">' + head + body + '</div></body></html>';
}
export function pdfFilename(r: Resume): string {
  return [r.basics.name, r.target.role, '简历'].filter(v => v.trim()).join('-').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150) + '.pdf';
}


