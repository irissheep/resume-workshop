import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { sampleResume, sparseResume, longResume } from '../src/shared/samples';
import { MODULES, cloneResume, type Resume } from '../src/shared/schema';
let app: ElectronApplication;
let page: Page;
let root: string;
const project = process.cwd();
async function launch(dataRoot: string) {
  const env: Record<string,string> = Object.fromEntries(Object.entries(process.env).filter((e): e is [string,string] => typeof e[1] === 'string'));
  env.RESUME_DATA_DIR = dataRoot; delete env.ELECTRON_RUN_AS_NODE; delete env.RESUME_DEV_URL;
  app = await _electron.launch({ ...(process.env.RESUME_PACKAGED_EXE ? { executablePath: process.env.RESUME_PACKAGED_EXE } : {}), args: process.env.RESUME_PACKAGED_EXE ? ['--test'] : ['.','--test'], cwd: project, env });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await expect(page.getByRole('heading', { name: '我的简历.' })).toBeVisible();
}
async function screenshot(filename: string) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  const png = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden:false, stayAwake:true })).toPNG().toString('base64'));
  await writeFile(filename, Buffer.from(png,'base64'));
}
async function exportTo(filename: string, resume: Resume) {
  await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename }); }, filename);
  return page.evaluate(resume => window.desktop.savePdf(resume), resume);
}
async function seed(resumes: Resume[]) {
  await mkdir(path.join(root,'resumes'), { recursive: true });
  for (const r of resumes) await writeFile(path.join(root,'resumes',r.id + '.json'), JSON.stringify(r));
  await writeFile(path.join(root,'.initialized'), '1');
}
test.beforeEach(async () => { await mkdir(path.join(project,'.cache/temp'), { recursive: true }); root = await mkdtemp(path.join(project,'.cache/temp','桌面 验证-')); });
test.afterEach(async ({},info) => { if (!app) return; if (info.status !== info.expectedStatus) await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); else await app.close(); });
test('desktop smoke: 无密钥手动编辑、关闭前保存、重启恢复及窗口缩放', async () => {
  await launch(root);
  await mkdir(path.join(project,'docs/screenshots'), { recursive: true });
  await screenshot(path.join(project,'docs/screenshots/library.png'));
  await page.getByRole('button', { name: '＋ 新建简历', exact:true }).click();
  await page.getByLabel('姓名', { exact:true }).fill('许知远（虚构测试）');
  await page.getByLabel('邮箱', { exact:true }).fill('test@example.com');
  await page.getByLabel('求职方向', { exact:true }).fill('软件实习生');
  await page.locator('.module-item > button').filter({ hasText:'教育背景' }).click();
  await page.getByRole('button', { name:'＋ 添加教育背景', exact:true }).click();
  await page.getByLabel('学校', { exact:true }).fill('虚构大学');
  await page.getByLabel('GPA（选填）').fill('3.8'); await page.getByLabel('GPA 满分').fill('4.0');
  await expect(page.locator('.save-status')).toContainText('已保存');
  await page.getByRole('button', { name:'商务单栏', exact:false }).click();
  await expect(page.getByRole('button', { name:'商务单栏', exact:false })).toHaveClass(/selected/);
  await screenshot(path.join(project,'docs/screenshots/editor.png'));
  const snapshot = await page.evaluate(async () => (await window.desktop.bootstrap()).resumes); // bootstrap 仅启动快照；文件用于验证实际保存。
  expect(snapshot.length).toBeGreaterThan(0);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(920,750));
  await expect(page.locator('.editor-form')).toBeVisible();
  await expect(page.locator('.preview-panel')).toBeHidden();
  const doc = (await readdir(path.join(root,'resumes'))).find(v => v !== snapshot[0].id + '.json')!;
  const saved = JSON.parse(await readFile(path.join(root,'resumes',doc),'utf8')) as Resume;
  await exportTo(path.join(root,'中文 导出 简历.pdf'), saved);
  await page.locator('.module-nav > button').filter({ hasText:'基本资料' }).click();
  await page.getByLabel('姓名', { exact:true }).fill('关闭前最后修改（虚构）');
  await app.close(); await launch(root);
  await page.getByRole('button', { name:'打开 未命名简历', exact:true }).click();
  await expect(page.getByLabel('姓名', { exact:true })).toHaveValue('关闭前最后修改（虚构）');
  await expect(page.getByRole('button', { name:'商务单栏', exact:false })).toHaveClass(/selected/);
});
test('desktop CRUD: 复制独立、删除取消、备份恢复与非法图片拒绝', async () => {
  await launch(root); await page.getByRole('button', { name:'复制', exact:true }).click();
  await page.getByLabel('姓名', { exact:true }).fill('副本姓名（虚构）');
  await expect(page.locator('.save-status')).toContainText('已保存');
  await page.getByRole('button', { name:'← 我的简历', exact:true }).click();
  await page.getByRole('button', { name:'打开 虚构示例 · 前端开发实习', exact:true }).click();
  await expect(page.getByLabel('姓名', { exact:true })).toHaveValue('林知夏（虚构）');
  await page.getByRole('button',{ name:'删除项目经历模块',exact:true }).click();
  await page.getByRole('button',{ name:'取消',exact:true }).click();
  await expect(page.locator('.module-item > button').filter({ hasText:'项目经历' })).toBeVisible();
  await page.getByRole('button',{ name:'删除项目经历模块',exact:true }).click();
  await page.getByRole('button',{ name:'确定',exact:true }).click();
  await expect(page.locator('.module-item > button').filter({ hasText:'项目经历' })).toHaveCount(0);
  await page.getByLabel('添加简历模块').selectOption('project');
  await expect(page.getByRole('heading',{ name:'项目经历',exact:true })).toBeVisible();
  await expect(page.getByRole('button',{ name:'＋ 添加项目经历',exact:true })).toBeVisible();
  await page.getByRole('button', { name:'← 我的简历', exact:true }).click();
  await page.getByRole('button', { name:'删除', exact:true }).first().click(); await page.getByRole('button', { name:'取消', exact:true }).click();
  await expect(page.locator('.resume-card')).toHaveCount(2);
  await page.getByRole('button', { name:'重命名', exact:true }).first().click(); await page.getByLabel('简历名称').fill('中文 名称测试'); await page.getByRole('button',{ name:'确定',exact:true }).click();
  const fixture = longResume(); fixture.experiences = fixture.experiences.slice(0,2);
  const backupPath = path.join(root,'照片 恢复.json');
  await app.evaluate(({ dialog },filename) => { dialog.showSaveDialog = async () => ({ canceled:false,filePath:filename }); },backupPath);
  await page.evaluate(r => window.desktop.exportBackup({ ...r, apiKey:'fake-untrusted-field' } as Resume),fixture);
  const text = await readFile(backupPath,'utf8'); expect(text).not.toContain('fake-untrusted');
  await app.evaluate(({ dialog },filename) => { dialog.showOpenDialog = async () => ({ canceled:false,filePaths:[filename] }); },backupPath);
  const imported = await page.evaluate(() => window.desktop.importBackup());
  expect(imported!.id).not.toBe(fixture.id); expect(imported!.basics.photo).toEqual(fixture.basics.photo);
  await writeFile(backupPath,JSON.stringify({ ...fixture,schemaVersion:99 }));
  await expect(page.evaluate(() => window.desktop.importBackup())).rejects.toThrow();
  await writeFile(backupPath,JSON.stringify({ ...fixture,basics:{ ...fixture.basics,photo:{ name:'invalid.png',dataUrl:'data:image/png;base64,AAAA' } } }));
  await expect(page.evaluate(() => window.desktop.importBackup())).rejects.toThrow('照片');
  const before = (await readdir(path.join(root,'resumes'))).length;
  await writeFile(backupPath,'{bad'); await expect(page.evaluate(() => window.desktop.importBackup())).rejects.toThrow();
  expect((await readdir(path.join(root,'resumes'))).length).toBe(before);
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled:true,filePath:'' }); });
  expect(await page.evaluate(r => window.desktop.savePdf(r),fixture)).toBeNull();
});
test('desktop AI: 真实 HTTP mock、加密配置、单段应用、过期与取消保护', async () => {
  let count = 0; let delay = 0; let received = ''; let httpStatus = 200; const completed = new Set<number>();
  const server: Server = createServer(async (req,res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const ordinal = ++count; received = body;
    if (httpStatus !== 200) { res.writeHead(httpStatus).end('simulated error'); return; }
    const data = JSON.parse(body); const last = data.messages.at(-1).content;
    let content = 'OK';
    if (last !== '请回复 OK。') {
      const payload = JSON.parse(last);
      const questions = data.messages[0].content.includes('只返回 questions 和 warnings');
      if (questions) content = JSON.stringify({ questions:[{ sourceEntryId:payload.experiences[0].sourceEntryId,questions:['请确认本人的具体工作？'] }] });
      else {
        const proposal: { entries:{ sourceEntryId:string;bullets:string[] }[];summary?:string;order?:string[] } = {
          entries:payload.experiences.map((e: { sourceEntryId:string }) => ({ sourceEntryId:e.sourceEntryId,bullets:['参与相关实践，依据已确认职责完成具体工作。'] }))
        };
        if (data.messages[0].content.includes('为每张输入经历提供建议文案')) proposal.summary = '依据课程项目与校园实践，整理已有前端开发经验。';
        if (data.messages[0].content.includes('依据目标岗位和岗位描述调整已有经历的表达重点')) proposal.order = [...payload.modules].reverse();
        content = JSON.stringify(proposal);
      }
    }
    const wait = delay; if (wait) await new Promise(resolve => setTimeout(resolve,wait));
    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ choices:[{ message:{ content } }] })); completed.add(ordinal);
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const port = (server.address() as { port:number }).port;
    const first = sampleResume(); const second = cloneResume(first,'另一份虚构简历'); await seed([first,second]); await launch(root);
    await page.getByRole('button',{ name:'模型设置',exact:true }).click();
    await page.getByLabel('模型服务地址', { exact:true }).fill('http://127.0.0.1:' + port);
    await page.getByLabel('模型名称', { exact:true }).fill('mock-model');
    await page.getByLabel('API Key', { exact:true }).fill('fake-test-key-not-a-credential');
    await page.getByLabel('使用系统加密记住密钥').check();
    await page.getByRole('button',{ name:'保存并测试连接',exact:true }).click();
    await expect(page.getByText('连接成功，聊天接口已返回有效文本', { exact:true })).toBeVisible();
    expect(received).not.toContain(first.basics.name); expect(count).toBe(1);
    expect(await readFile(path.join(root,'model-settings.json'),'utf8')).not.toContain('fake-test-key-not-a-credential');
    await page.getByRole('button',{ name:'我的简历',exact:false }).first().click();
    await page.getByRole('button',{ name:'打开 ' + first.name,exact:true }).click();
    await page.getByRole('button',{ name:'✦ 生成简历文案',exact:true }).click();
    await expect(page.getByRole('button',{ name:/^采用全部待确认文案/ })).toBeVisible();
    await expect(page.frameLocator('iframe[title="编辑简历预览"]').getByText(first.experiences[0].bullets[0].text,{ exact:true })).toBeVisible();
    await page.getByLabel('建议简介',{ exact:true }).fill('用户核对后修改的建议简介（虚构）');
    await page.getByRole('button',{ name:/^采用全部待确认文案/ }).click();
    await page.getByRole('button',{ name:'关闭 AI 建议',exact:true }).click();
    await page.locator('.module-item > button').filter({ hasText:'个人简介' }).click();
    await expect(page.getByLabel('正式简介（选填）',{ exact:true })).toHaveValue('用户核对后修改的建议简介（虚构）');
    await page.getByRole('button',{ name:'按岗位调整',exact:true }).click();
    await expect(page.getByRole('button',{ name:'采用模块顺序',exact:true })).toBeVisible();
    await expect(page.locator('.module-item > button').first()).toContainText('个人简介');
    await page.getByRole('button',{ name:'采用模块顺序',exact:true }).click();
    await page.getByRole('button',{ name:'关闭 AI 建议',exact:true }).click();
    await expect(page.locator('.module-item > button').first()).toContainText('技能与证书');
    await page.locator('.module-item > button').filter({ hasText:'项目经历' }).click();
    await page.getByLabel('正式描述 1',{ exact:true }).fill('手动保留的项目 A（虚构测试）');
    await page.locator('.module-item > button').filter({ hasText:'校园经历' }).click();
    await page.getByRole('button',{ name:'✦ 优化表达',exact:true }).click();
    await expect(page.getByRole('button',{ name:'采用此经历描述',exact:true })).toBeVisible();
    await page.getByRole('button',{ name:'采用此经历描述',exact:true }).click();
    await page.getByRole('button',{ name:'关闭 AI 建议',exact:true }).click();
    await expect(page.getByLabel('正式描述 1', { exact:true })).toHaveValue('参与相关实践，依据已确认职责完成具体工作。');
    await expect(page.getByLabel('原始关键词 / 口语描述')).toHaveValue(first.experiences[1].keywords);
    await page.locator('.module-item > button').filter({ hasText:'项目经历' }).click();
    await expect(page.getByLabel('正式描述 1',{ exact:true })).toHaveValue('手动保留的项目 A（虚构测试）');
    await page.locator('.module-item > button').filter({ hasText:'校园经历' }).click();
    await page.getByRole('button',{ name:'✦ 帮我补充经历',exact:true }).click();
    await page.getByLabel('请确认本人的具体工作？').fill('本人整理活动资料。');
    await page.getByRole('button',{ name:'确认并加入此经历事实',exact:true }).click();

    await expect(page.getByLabel('已确认事实')).toHaveValue(/本人整理活动资料/);
    delay = 2000;
    await page.getByRole('button',{ name:'✦ 优化表达',exact:true }).click();
    await page.getByRole('button',{ name:'关闭 AI 建议',exact:true }).click();
    await page.getByLabel('正式描述 1', { exact:true }).fill('等待时手动修改');
    await page.getByRole('button',{ name:/^查看/ }).click();
    await expect(page.getByText('基于较早内容生成', { exact:true })).toBeVisible();
    await expect(page.getByRole('button',{ name:'采用此经历描述',exact:true })).toBeDisabled();
    await page.getByRole('button',{ name:'关闭 AI 建议',exact:true }).click();
    delay = 10_000;
    await page.getByRole('button',{ name:'✦ 精简内容',exact:true }).click();
    await page.getByRole('button',{ name:'取消当前请求',exact:true }).click();
    await expect(page.getByText('已取消', { exact:true })).toBeVisible();
    await page.getByRole('button',{ name:'关闭 AI 建议',exact:true }).click();
    await expect(page.getByLabel('正式描述 1', { exact:true })).toHaveValue('等待时手动修改');
    await page.getByRole('button',{ name:'← 我的简历',exact:true }).click();
    await page.getByRole('button',{ name:'打开 ' + second.name,exact:true }).click();
    await expect(page.getByLabel('姓名', { exact:true })).toHaveValue(second.basics.name);
    await page.getByRole('button',{ name:'← 我的简历',exact:true }).click();
    await page.getByRole('button',{ name:'打开 ' + first.name,exact:true }).click();
    await page.locator('.module-item > button').filter({ hasText:'校园经历' }).click();
    const previousCount = count;
    delay = 3000;
    await page.getByRole('button',{ name:'✦ 优化表达',exact:true }).click();
    await page.getByRole('button',{ name:'关闭 AI 建议',exact:true }).click();
    await page.getByRole('button',{ name:'← 我的简历',exact:true }).click();
    await page.getByRole('button',{ name:'打开 ' + second.name,exact:true }).click();
    await page.locator('.module-item > button').filter({ hasText:'校园经历' }).click();
    await expect(page.getByLabel('正式描述 1',{ exact:true })).toHaveValue(second.experiences[1].bullets[0].text);
    await expect.poll(() => count).toBe(previousCount + 1);
    await expect.poll(() => completed.has(previousCount + 1)).toBe(true);
    await expect(page.getByLabel('正式描述 1',{ exact:true })).toHaveValue(second.experiences[1].bullets[0].text);
    await page.getByRole('button',{ name:'← 我的简历',exact:true }).click();
    await page.getByRole('button',{ name:'打开 ' + first.name,exact:true }).click();
    await page.getByRole('button',{ name:/^查看/ }).click();
    await expect(page.getByRole('button',{ name:'采用此经历描述',exact:true })).toBeVisible();
    await page.getByRole('button',{ name:'关闭 AI 建议',exact:true }).click();
    const result = await page.evaluate(async r => {
      const id = crypto.randomUUID();
      const waiting = window.desktop.ai({ requestId:id,resume:r,action:'generate' });
      const duplicate = await window.desktop.ai({ requestId:crypto.randomUUID(),resume:r,action:'generate' });
      await window.desktop.cancel(id); const cancelled = await waiting; return { duplicate,cancelled };
    },first);
    expect(result.duplicate.status).toBe('failed'); expect(result.cancelled.status).toBe('cancelled');
    delay = 0; httpStatus = 429;
    await expect(page.evaluate(() => window.desktop.testConnection())).rejects.toThrow('限流');
    expect(received).not.toContain('13800000000');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('PDF layout: 三组虚构数据 × 三种模板，分页、中文字和完整正文', async () => {
  await launch(root);
  await page.getByRole('button',{ name:'打开 虚构示例 · 前端开发实习',exact:true }).click();
  await page.getByRole('button',{ name:'PDF 分页预览',exact:true }).click();
  await expect(page.getByRole('dialog',{ name:'真实 PDF 预览',exact:true })).toBeVisible();
  await expect.poll(() => page.frames().some(frame => frame.url().startsWith('chrome-extension://') && frame.url().endsWith('/index.html'))).toBe(true);
  await expect.poll(async () => {
    for (const frame of page.frames().filter(frame => frame.url().startsWith('resume://ui/preview/'))) {
      if (await frame.locator('embed[type="application/x-google-chrome-pdf"]').count()) return true;
    }
    return false;
  }).toBe(true);
  // Give the native PDF plugin time to paint before capturing the visual evidence.
  await page.waitForTimeout(1500);
  await screenshot(path.join(project,'docs/screenshots/pdf-preview.png'));
  await page.getByRole('button',{ name:'关闭 PDF 预览',exact:true }).click();
  await page.locator('.module-item > button').filter({ hasText:'项目经历' }).click();
  await screenshot(path.join(project,'docs/screenshots/editor.png'));
  const out = path.join(project,'docs/qa/pdf'); await mkdir(out,{ recursive:true });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const report: { name:string;template:string;pages:number;selectable:boolean }[] = [];
  const complete = sampleResume();
  Object.assign(complete.experiences[1], {
    kind:'work', name:'页面开发实习（虚构）', organization:'示例软件工作室（虚构）',
    start:'2025-07', end:'2025-08', role:'前端实习生',
    keywords:'在团队指导下参与内部页面开发，表单校验和异常提示',
    facts:'本人在团队指导下实现表单校验和异常状态提示。',
    bullets:[{ id:complete.experiences[1].bullets[0].id, text:'在团队指导下参与内部页面开发，完成表单校验和异常状态提示。' }]
  });
  for (const [name,fixture] of [['sparse',sparseResume()],['complete',complete],['long',longResume()]] as const) {
    for (const template of ['simple','business','campus'] as const) {
      const resume = structuredClone(fixture); resume.display.template = template;
      const filename = path.join(out,name + '-' + template + '.pdf'); await exportTo(filename,resume);
      const doc = await getDocument({ data:new Uint8Array(await readFile(filename)),useSystemFonts:true }).promise;
      let all = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const pdfPage = await doc.getPage(i); const text = await pdfPage.getTextContent();
        const strings = text.items.filter((v): v is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in v && !!v.str.trim());
        expect(strings.length,'空白 PDF 页面 ' + filename + ' #' + i).toBeGreaterThan(0);
        for (const item of strings) {
          expect(item.transform[4] >= 0 && item.transform[4] + item.width <= 600, '横向文字截断 ' + filename).toBeTruthy();
          expect(item.transform[5] >= 0 && item.transform[5] <= 850,'纵向文字截断 ' + filename).toBeTruthy();
        }
        all += strings.map(v => v.str).join('');
      }
      const normalized = all.replace(/\s/g,'');
      expect(normalized).toContain(resume.basics.name.replace(/\s/g,''));
      for (const e of resume.experiences) for (const b of e.bullets) expect(normalized.includes(b.text.replace(/\s/g,'')), filename + ' 正文不完整：' + e.name + ' / ' + b.id).toBeTruthy();
      expect(normalized).not.toContain('编辑工作台'); expect(normalized).not.toContain('帮我补充经历');
      if (name === 'long') expect(doc.numPages).toBeGreaterThan(1);
      if (name === 'complete') expect(doc.numPages).toBe(1);
      report.push({ name,template,pages:doc.numPages,selectable:true }); await doc.cleanup();
    }
  }
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
});







test('desktop recovery: 保存失败保留内存、备份可用、重试后正确显示已保存', async () => {
  await launch(root);
  await page.getByRole('button',{ name:'打开 虚构示例 · 前端开发实习',exact:true }).click();
  const drafts = path.join(root,'resumes'); const held = path.join(root,'resumes-held');
  await rename(drafts,held); await writeFile(drafts,'simulated obstruction');
  await page.getByLabel('姓名',{ exact:true }).fill('保存失败后仍保留（虚构）');
  await expect(page.locator('.save-status')).toContainText('保存失败');
  await expect(page.getByLabel('姓名',{ exact:true })).toHaveValue('保存失败后仍保留（虚构）');
  const backupFile = path.join(root,'失败时备份.json');
  await app.evaluate(({ dialog },filename) => { dialog.showSaveDialog = async () => ({ canceled:false,filePath:filename }); },backupFile);
  await page.getByRole('button',{ name:'JSON 备份',exact:true }).click();
  await expect(page.locator('.toast')).toContainText('备份已保存');
  expect(JSON.parse(await readFile(backupFile,'utf8')).basics.name).toBe('保存失败后仍保留（虚构）');
  await unlink(drafts); await rename(held,drafts);
  await page.getByRole('button',{ name:'重试保存',exact:true }).click();
  await expect(page.locator('.save-status')).toContainText('已保存');
  const filenames = await readdir(drafts);
  expect(JSON.parse(await readFile(path.join(drafts,filenames[0]),'utf8')).basics.name).toBe('保存失败后仍保留（虚构）');
});



test('desktop display: 模板切换、排序隐藏、照片开关与确认删除', async () => {
  const fixture = sampleResume(); await seed([fixture]); await launch(root);
  await page.getByRole('button',{ name:'打开 ' + fixture.name,exact:true }).click();
  const preview = page.frameLocator('iframe[title="编辑简历预览"]');
  await app.evaluate(({ dialog },filename) => { dialog.showOpenDialog = async () => ({ canceled:false,filePaths:[filename] }); },path.join(project,'docs/qa/fictional-avatar.png'));
  await page.getByRole('button',{ name:'选择照片',exact:true }).click();
  await expect(preview.getByRole('img',{ name:'个人照片',exact:true })).toBeVisible();
  await page.getByLabel('照片',{ exact:true }).uncheck();
  await expect(preview.getByRole('img',{ name:'个人照片',exact:true })).toHaveCount(0);
  await page.getByLabel('照片',{ exact:true }).check();
  for (const name of ['简洁单栏','商务单栏','校园双栏']) {
    await page.getByRole('button',{ name,exact:false }).click();
    await expect(preview.getByText(fixture.experiences[0].bullets[0].text,{ exact:true })).toBeVisible();
    await expect(preview.getByRole('img',{ name:'个人照片',exact:true })).toBeVisible();
  }
  await page.getByRole('button',{ name:'商务单栏',exact:false }).click();
  await page.getByRole('button',{ name:'选择主题色 #244976',exact:true }).click();
  await page.getByRole('button',{ name:'项目经历上移模块',exact:true }).click();
  await expect(preview.locator('h2').nth(1)).toHaveText('项目经历');
  await expect(preview.locator('h2').nth(2)).toHaveText('教育背景');
  await page.getByRole('button',{ name:'项目经历隐藏模块',exact:true }).click();
  await expect(preview.getByRole('heading',{ name:'项目经历',exact:true })).toHaveCount(0);
  await page.locator('.module-item > button').filter({ hasText:'项目经历' }).click();
  await expect(page.getByLabel('原始关键词 / 口语描述')).toHaveValue(fixture.experiences[0].keywords);
  await page.getByRole('button',{ name:'项目经历显示模块',exact:true }).click();
  await page.getByRole('button',{ name:'荣誉奖项隐藏模块',exact:true }).click();
  await expect(preview.getByText(fixture.awards[0].name,{ exact:true })).toHaveCount(0);
  await expect(page.locator('.save-status')).toContainText('已保存');
  const saved = JSON.parse(await readFile(path.join(root,'resumes',fixture.id + '.json'),'utf8')) as Resume;
  expect(saved.experiences).toEqual(fixture.experiences);
  expect(saved.display.color).toBe('#244976'); expect(saved.basics.photo).not.toBeNull();
  const filename = path.join(root,'排序 隐藏 验证.pdf'); await exportTo(filename,saved);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data:new Uint8Array(await readFile(filename)),useSystemFonts:true }).promise;
  let text = '';
  for (let i=1;i<=pdf.numPages;i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map(v => 'str' in v ? v.str : '').join('');
  expect(text).not.toContain(fixture.awards[0].name);
  expect(text.indexOf('项目经历')).toBeLessThan(text.indexOf('教育背景'));
  await pdf.cleanup();
  await page.getByRole('button',{ name:'← 我的简历',exact:true }).click();
  await page.getByRole('button',{ name:'复制',exact:true }).click();
  await expect(page.locator('.save-status')).toContainText('已保存');
  await page.getByRole('button',{ name:'← 我的简历',exact:true }).click();
  const copyCard = page.locator('.resume-card').filter({ has:page.getByRole('button',{ name:'打开 ' + fixture.name + ' - 副本',exact:true }) });
  await copyCard.getByRole('button',{ name:'删除',exact:true }).click();
  await page.getByRole('button',{ name:'确定',exact:true }).click();
  await expect(page.locator('.resume-card')).toHaveCount(1);
  expect(await readdir(path.join(root,'resumes'))).toEqual([fixture.id + '.json']);
  await app.close(); await launch(root);
  await page.getByRole('button',{ name:'打开 ' + fixture.name,exact:true }).click();
  await expect(page.getByRole('button',{ name:'商务单栏',exact:false })).toHaveClass(/selected/);
  const restoredPreview = page.frameLocator('iframe[title="编辑简历预览"]');
  await expect(restoredPreview.getByRole('img',{ name:'个人照片',exact:true })).toBeVisible();
  await expect(restoredPreview.getByText(fixture.awards[0].name,{ exact:true })).toHaveCount(0);
});