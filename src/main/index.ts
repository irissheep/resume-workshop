import { app, BrowserWindow, ipcMain, protocol, session, dialog, safeStorage, nativeImage, Menu, type IpcMainInvokeEvent } from 'electron';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { resumeSchema, aiRequestSchema, validateResume, VERSION, type Resume } from '../shared/schema';
import { resumeHtml, pdfFilename } from '../shared/templates';
import { sampleResume } from '../shared/samples';
import { buildMessages, parseSuggestion } from '../shared/ai';
import { ResumeStore, atomicWrite, parseBackup, BACKUP_LIMIT } from './storage';
import { ModelSettings, chat } from './model';

const dataRoot = process.env.RESUME_DATA_DIR || app.getPath('userData');
mkdirSync(path.join(dataRoot, 'session'), { recursive: true });
mkdirSync(path.join(dataRoot, 'crashes'), { recursive: true });
app.setPath('userData', dataRoot);
app.setPath('sessionData', path.join(dataRoot, 'session'));
app.setPath('crashDumps', path.join(dataRoot, 'crashes'));
protocol.registerSchemesAsPrivileged([{ scheme: 'resume', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setAppUserModelId('local.resume.generator');
const testMode = process.argv.includes('--test');
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => { if (window && !testMode) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
const store = new ResumeStore(dataRoot);
const settings = new ModelSettings(dataRoot, safeStorage);
let window: BrowserWindow;
let allowClose = false;
let closing = false;
const requests = new Map<string, { resumeId: string; controller: AbortController }>();
const pdfs = new Map<string, { buffer: Buffer; hash: string }>();
let pdfTail = Promise.resolve();
function validatePhoto(r: Resume): Resume {
  if (!r.basics.photo) return r;
  const data = Buffer.from(r.basics.photo.dataUrl.split(',')[1], 'base64');
  const mime = r.basics.photo.dataUrl.startsWith('data:image/png;') ? 'png' : 'jpeg';
  const validSignature = mime === 'png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : data[0] === 255 && data[1] === 216 && data[data.length - 2] === 255 && data[data.length - 1] === 217;
  const image = nativeImage.createFromDataURL(r.basics.photo.dataUrl);
  const size = image.getSize();
  if (!validSignature || data.length > 5 * 1024 * 1024 || image.isEmpty() || size.width * size.height > 40_000_000) throw new Error('照片无效或超过上限（PNG/JPEG、5 MB、4000 万像素）');
  return r;
}
function checked(input: unknown, mode: 'draft' | 'generate' | 'export' = 'draft'): Resume {
  const r = validatePhoto(resumeSchema.parse(input));
  if (Buffer.byteLength(JSON.stringify(r)) > BACKUP_LIMIT) throw new Error('简历数据超过 10 MB');
  if (mode !== 'draft') {
    const errors = validateResume(r, mode); if (errors.length) throw new Error(errors.map(e => e.message).join('；'));
  }
  return r;
}
function trusted(event: IpcMainInvokeEvent) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('拒绝未授权的桌面请求');
  const url = event.senderFrame.url;
  if (!(url.startsWith('resume://ui/') || (!app.isPackaged && url.startsWith('http://127.0.0.1:5173/')))) throw new Error('拒绝未知来源');
}
function handle(channel: string, callback: (arg: unknown) => unknown) {
  ipcMain.handle(channel, async (event, arg) => {
    trusted(event);
    try { return await callback(arg); }
    catch (error) {
      if (error instanceof z.ZodError) throw new Error('数据格式无效，请检查字段与支持的版本');
      const code = (error as NodeJS.ErrnoException).code;
      if (code && ['EACCES','EPERM','ENOSPC','ENOENT','EIO','EBUSY'].includes(code)) throw new Error('文件操作失败（' + code + '），当前草稿仍保留，请检查磁盘或访问权限');
      throw error;
    }
  });
}
async function generatePdf(r: Resume): Promise<{ token: string; buffer: Buffer }> {
  const hash = createHash('sha256').update(JSON.stringify(r)).digest('hex');
  for (const [token, value] of pdfs) if (value.hash === hash) return { token, buffer: value.buffer };
  const operation = pdfTail.then(async () => {
    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    try {
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      printWindow.webContents.on('will-navigate', event => event.preventDefault());
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(resumeHtml(r)));
      await printWindow.webContents.executeJavaScript('Promise.all([document.fonts.ready, ...Array.from(document.images).map(img => img.decode())])');
      const buffer = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true, generateTaggedPDF: true });
      const token = crypto.randomUUID(); pdfs.set(token, { buffer, hash });
      while (pdfs.size > 3) pdfs.delete(pdfs.keys().next().value!);
      return { token, buffer };
    } finally { printWindow.destroy(); }
  });
  pdfTail = operation.then(() => undefined, () => undefined); return operation;
}
async function initialize() {
  await mkdir(dataRoot, { recursive: true }); await mkdir(path.join(dataRoot, 'session'), { recursive: true });
  const loaded = await store.load(); await settings.load();
  let first = false;
  try { await stat(path.join(dataRoot, '.initialized')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') first = true; else throw error; }
  if (first && !loaded.resumes.length && !loaded.warnings.length) { const sample = sampleResume(); await store.save(sample); loaded.resumes.push(sample); }
  if (first) await atomicWrite(path.join(dataRoot, '.initialized'), '1');
  return loaded;
}
const initialized = app.whenReady().then(async () => {
  await mkdir(path.join(dataRoot, 'session'), { recursive: true });
  protocol.handle('resume', async request => {
    const url = new URL(request.url);
    if (url.hostname !== 'ui') return new Response('', { status: 403 });
    if (url.pathname.startsWith('/preview/')) {
      const token = url.pathname.slice('/preview/'.length).replace(/\.pdf$/, '');
      const pdf = pdfs.get(token);
      return pdf ? new Response(new Uint8Array(pdf.buffer), { headers: { 'Content-Type': 'application/pdf' } }) : new Response('', { status: 404 });
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const root = path.resolve(__dirname, '../renderer');
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep)) return new Response('', { status: 403 });
    const ext = path.extname(filename);
    const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    if (!mime[ext]) return new Response('', { status: 404 });
    try { return new Response(new Uint8Array(await readFile(filename)), { headers: { 'Content-Type': mime[ext] } }); }
    catch { return new Response('', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({ width: 1510, height: 970, minWidth: 850, minHeight: 650, show: !testMode, backgroundColor: '#f6f7f8', title: '简历工坊', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    if (!closing) { closing = true; window.webContents.send('app:closing'); }
  });
  ipcMain.on('app:close-ready', async (event, success) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || typeof success !== 'boolean') return;
    if (success) { await store.flush(); for (const r of requests.values()) r.controller.abort(); allowClose = true; window.close(); }
    else closing = false;
  });
  handle('bootstrap', async () => ({ ...await initialData, config: settings.public(), dataDirectory: dataRoot, version: VERSION }));
  handle('resume:save', arg => store.save(checked(arg)));
  handle('resume:remove', async arg => {
    const id = z.string().uuid().parse(arg); await store.remove(id);
    for (const r of requests.values()) if (r.resumeId === id) r.controller.abort();
  });
  handle('backup:import', async () => {
    const picked = await dialog.showOpenDialog(window, { title: '恢复简历备份（会创建新简历）', filters: [{ name: '简历 JSON 备份', extensions: ['json'] }], properties: ['openFile'] });
    if (picked.canceled) return null;
    const filename = picked.filePaths[0];
    if ((await stat(filename)).size > BACKUP_LIMIT) throw new Error('备份超过 10 MB');
    const data = await readFile(filename, 'utf8'); checked(parseBackup(data)); return store.import(data);
  });
  handle('backup:export', async arg => {
    const r = checked(arg);
    const picked = await dialog.showSaveDialog(window, { title: '导出简历备份（不包含模型密钥）', defaultPath: pdfFilename(r).replace(/\.pdf$/, '.json'), filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (picked.canceled || !picked.filePath) return null;
    await atomicWrite(picked.filePath, JSON.stringify(r, null, 2)); return picked.filePath;
  });
  handle('photo:choose', async () => {
    const picked = await dialog.showOpenDialog(window, { title: '选择照片（PNG/JPEG，最大 5 MB）', filters: [{ name: '照片', extensions: ['png','jpg','jpeg'] }], properties: ['openFile'] });
    if (picked.canceled) return null;
    const filename = picked.filePaths[0];
    if ((await stat(filename)).size > 5 * 1024 * 1024) throw new Error('照片不能超过 5 MB');
    const bytes = await readFile(filename); const mime = path.extname(filename).toLowerCase() === '.png' ? 'png' : 'jpeg';
    const r = sampleResume(); r.basics.photo = { name: path.basename(filename), dataUrl: 'data:image/' + mime + ';base64,' + bytes.toString('base64') };
    return validatePhoto(r).basics.photo;
  });
  handle('pdf:preview', async arg => { const pdf = await generatePdf(checked(arg, 'export')); return 'resume://ui/preview/' + pdf.token + '.pdf'; });
  handle('pdf:save', async arg => {
    const r = checked(arg, 'export');
    const picked = await dialog.showSaveDialog(window, { title: '导出 PDF 简历', defaultPath: pdfFilename(r), filters: [{ name: 'PDF 简历', extensions: ['pdf'] }] });
    if (picked.canceled || !picked.filePath) return null;
    const pdf = await generatePdf(r); await atomicWrite(picked.filePath, pdf.buffer); return picked.filePath;
  });
  handle('model:save', arg => settings.save(arg));
  handle('model:clear', () => settings.clear());
  let testing = false;
  handle('model:test', async () => {
    if (testing) throw new Error('连接测试正在进行，请等待完成');
    testing = true;
    try { await chat(settings.snapshot(), [{ role: 'user', content: '请回复 OK。' }], new AbortController().signal); return '连接成功，聊天接口已返回有效文本'; }
    finally { testing = false; }
  });
  handle('ai:start', async arg => {
    const request = aiRequestSchema.parse(arg); checked(request.resume, 'generate');
    if ([...requests.values()].some(r => r.resumeId === request.resume.id)) return { status: 'failed', error: '当前简历已有 AI 请求，请等待或取消' };
    const controller = new AbortController(); requests.set(request.requestId, { resumeId: request.resume.id, controller });
    try {
      const raw = await chat(settings.snapshot(), buildMessages(request), controller.signal);
      if (controller.signal.aborted) return { status: 'cancelled', error: '请求已取消' };
      return { status: 'success', suggestion: parseSuggestion(raw, request) };
    } catch (error) { return { status: controller.signal.aborted ? 'cancelled' : 'failed', error: (error as Error).message }; }
    finally { requests.delete(request.requestId); }
  });
  handle('ai:cancel', arg => { const id = z.string().uuid().parse(arg); requests.get(id)?.controller.abort(); });
  await initialData;
  await window.loadURL(!app.isPackaged && process.env.RESUME_DEV_URL ? process.env.RESUME_DEV_URL : 'resume://ui/index.html');
});
const initialData = app.whenReady().then(initialize);
initialized.catch(error => { dialog.showErrorBox('无法启动简历工坊', '本地数据目录初始化失败，请检查路径和权限。原数据不会被重置。\n' + ((error as NodeJS.ErrnoException).code || '初始化错误')); app.exit(1); });
app.on('window-all-closed', () => app.quit());


