import { useEffect, useRef, useState } from 'react';
import { LABELS, MODULES, COLORS, VERSION, cloneResume, move, newResume, uid, validateResume, type Resume, type ModuleId, type Action, type Suggestion } from '../shared/schema';
import { applySuggestion, canApply } from '../shared/ai';
import { TEMPLATES, resumeHtml } from '../shared/templates';
import { Editor } from './Editor';
import { Settings } from './Settings';
import { Suggestions, type Job } from './Suggestions';
import { useResumes } from './useResumes';
type Page = 'library' | 'editor' | 'settings' | 'help';
interface Ask { message: string; initial?: string; resolve: (value: string | boolean | null) => void }
const ACTION_LABELS: Record<Action, string> = { generate: '生成简历文案', questions: '补充提问', polish: '优化表达', shorten: '精简内容', contribution: '突出个人贡献', tailor: '按岗位调整' };
export function App() {
  const store = useResumes();
  const [page, setPage] = useState<Page>('library');
  const [activeId, setActiveId] = useState('');
  const [module, setModule] = useState<'basics' | ModuleId>('basics');
  const [previewVisible, setPreviewVisible] = useState(true);
  const [zoom, setZoom] = useState(0.52);
  const [previewHeight, setPreviewHeight] = useState(1123);
  const [toast, setToast] = useState<{ message: string; bad: boolean }>();
  const [ask, setAsk] = useState<Ask>();
  const [askValue, setAskValue] = useState('');
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const jobsRef = useRef<Record<string, Job>>({});
  const requests = useRef<Record<string, { action: Action; entryId?: string }>>({});
  const [aiOpen, setAiOpen] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; resume: Resume }>();
  const [pdfBusy, setPdfBusy] = useState(false);
  const r = store.resumes.find(v => v.id === activeId) || store.resumes[0];
  const job = r && jobs[r.id];
  const closeAsk = useRef<() => void>(() => {});
  function notify(message: string, bad = false) { setToast({ message: message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''), bad }); }
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(undefined), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { closeAsk.current(); setPdf(undefined); setAiOpen(false); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  function resolveAsk(value: string | boolean | null) { ask?.resolve(value); setAsk(undefined); }
  closeAsk.current = () => resolveAsk(null);
  function confirm(message: string): Promise<boolean> { return new Promise(resolve => { setAsk({ message, resolve: value => resolve(value === true) }); }); }
  function prompt(message: string, initial: string): Promise<string | null> { return new Promise(resolve => { setAskValue(initial); setAsk({ message, initial, resolve: value => resolve(typeof value === 'string' ? value.trim() : null) }); }); }
  function open(resume: Resume) { setActiveId(resume.id); setPage('editor'); setAiOpen(false); setModule('basics'); }
  function edit(mutate: (next: Resume) => void) {
    const current = store.documents.current.find(v => v.id === r.id); if (!current) return;
    const next = structuredClone(current); mutate(next); next.revision++; next.updatedAt = new Date().toISOString(); store.put(next);
  }
  function updateJob(id: string, next: Job) { jobsRef.current = { ...jobsRef.current, [id]: next }; setJobs(jobsRef.current); }
  async function startAI(action: Action, entryId?: string) {
    if (!r) return;
    if (!store.config?.keyAvailable || !store.config.model.trim()) { notify('请先配置模型服务与密钥，当前草稿已保留'); setPage('settings'); return; }
    if (jobsRef.current[r.id]?.state === 'waiting') { setAiOpen(true); return; }
    const errors = validateResume(r, 'generate');
    if (errors.length) { notify('请先修正资料：' + errors.map(e => e.message).join('；'), true); return; }
    const snapshot = structuredClone(r); const requestId = uid();
    requests.current[r.id] = { action, entryId };
    updateJob(r.id, { requestId, state: 'waiting' }); setAiOpen(true);
    try {
      const reply = await window.desktop.ai({ requestId, resume: snapshot, action, entryId });
      const latestJob = jobsRef.current[snapshot.id];
      if (latestJob?.requestId !== requestId || latestJob.state === 'cancelled') return;
      updateJob(snapshot.id, reply.status === 'success' ? { requestId, state: 'success', suggestion: reply.suggestion } : { requestId, state: reply.status, error: reply.error });
    } catch (error) {
      if (jobsRef.current[snapshot.id]?.state !== 'cancelled') updateJob(snapshot.id, { requestId, state: 'failed', error: (error as Error).message });
    }
  }
  async function cancelAI() {
    if (!r || !job) return;
    updateJob(r.id, { requestId: job.requestId, state: 'cancelled', error: '请求已取消，正式文案未修改。' });
    try { await window.desktop.cancel(job.requestId); } catch (error) { notify((error as Error).message, true); }
  }
  async function adopt(scope: string) {
    if (!r || !job?.suggestion) return;
    try {
      const current = store.documents.current.find(v => v.id === r.id)!;
      const s = jobsRef.current[r.id].suggestion!;
      const next = applySuggestion(current, s, scope); store.put(next);
      const rest = { ...s, revision: next.revision, entries: s.entries.filter(e => scope !== 'all' && e.sourceEntryId !== scope), summary: scope === 'all' || scope === 'summary' ? undefined : s.summary, order: scope === 'all' || scope === 'order' ? undefined : s.order };
      updateJob(r.id, { ...job, suggestion: rest }); notify(scope === 'all' ? '已采用全部待确认文案，原始素材保留' : '已采用当前建议');
    } catch (error) { notify((error as Error).message, true); }
  }
  function addFacts(entryId: string, facts: string) {
    if (!r || !job?.suggestion) return;
    const current = store.documents.current.find(v => v.id === r.id)!;
    if (!canApply(current, job.suggestion)) { notify('资料已修改，请重新提问', true); return; }
    const e = current.experiences.find(e => e.id === entryId);
    if (!e || e.facts.length + facts.length > 20000) { notify('确认事实内容过长，或原经历已不存在', true); return; }
    edit(n => { const target = n.experiences.find(e => e.id === entryId)!; target.facts = [target.facts, facts].filter(Boolean).join('\n\n'); });
    setAiOpen(false); updateJob(r.id, { ...job, suggestion: undefined }); notify('回答已加入此经历的确认事实，可再次点击生成或改写');
  }
  async function removeModule(id: ModuleId) {
    if (!await confirm('删除“' + LABELS[id] + '”模块及其全部内容？只想暂时不展示时，请使用隐藏按钮。')) return;
    edit(n => {
      if (id === 'summary') n.summary = '';
      else if (id === 'education') n.education = [];
      else if (id === 'awards') n.awards = [];
      else if (id === 'skills') n.skills = [];
      else n.experiences = n.experiences.filter(e => e.kind !== id);
      n.display.order = n.display.order.filter(v => v !== id); n.display.hidden = n.display.hidden.filter(v => v !== id);
    });
    setModule('basics');
  }
  async function create() { const doc = newResume(); store.put(doc); open(doc); }
  async function rename(doc: Resume) {
    const name = await prompt('重命名简历', doc.name);
    if (!name) return;
    const current = store.documents.current.find(v => v.id === doc.id)!; store.put({ ...current, name, revision: current.revision + 1, updatedAt: new Date().toISOString() });
  }
  async function duplicate(doc: Resume) { const copy = cloneResume(doc); store.put(copy); open(copy); notify('已创建独立副本'); }
  async function remove(doc: Resume) {
    if (!await confirm('删除“' + doc.name + '”？其草稿和照片将从本地移除。')) return;
    try { await store.remove(doc.id); notify('简历已删除'); } catch (error) { notify((error as Error).message, true); }
  }
  async function importBackup() {
    try { const doc = await window.desktop.importBackup(); if (doc) { store.addImported(doc); open(doc); notify('备份已恢复为独立的新简历'); } }
    catch (error) { notify((error as Error).message, true); }
  }
  async function backup() {
    try { const filename = await window.desktop.exportBackup(r); if (filename) notify('备份已保存：' + filename); }
    catch (error) { notify((error as Error).message, true); }
  }
  async function previewPDF() {
    if (!r) return;
    const errors = validateResume(r, 'export');
    if (errors.length) { notify(errors.map(e => e.message).join('；'), true); return; }
    if (!r.basics.phone.trim() && !r.basics.email.trim()) notify('尚未填写电话或邮箱，建议补充联系方式');
    setPdfBusy(true);
    try { const snapshot = structuredClone(r); setPdf({ resume: snapshot, url: await window.desktop.pdf(snapshot) }); }
    catch (error) { notify((error as Error).message, true); } finally { setPdfBusy(false); }
  }
  async function exportPDF(snapshot = r) {
    if (!snapshot) return;
    const errors = validateResume(snapshot, 'export');
    if (errors.length) { notify(errors.map(e => e.message).join('；'), true); return; }
    if (!snapshot.basics.phone.trim() && !snapshot.basics.email.trim()) notify('尚未填写电话或邮箱，建议补充联系方式');
    setPdfBusy(true);
    try { const filename = await window.desktop.savePdf(snapshot); if (filename) notify('PDF 已保存：' + filename); }
    catch (error) { notify((error as Error).message, true); } finally { setPdfBusy(false); }
  }
  async function photo() {
    const id = r.id;
    try {
      const picked = await window.desktop.choosePhoto(); if (!picked) return;
      const current = store.documents.current.find(v => v.id === id); if (!current) return;
      const next = structuredClone(current); next.basics.photo = picked; next.revision++; next.updatedAt = new Date().toISOString(); store.put(next);
    } catch (error) { notify((error as Error).message, true); }
  }
  if (store.fatal) return <div className="fatal"><h1>暂时无法打开工作台</h1><p>{store.fatal}</p></div>;
  if (!store.ready || !store.config) return <div className="loading"><span className="spinner"/>正在打开本地简历…</div>;
  return <div className="app">
    <aside className="app-sidebar"><div className="brand"><div className="brand-mark">R<span>✦</span></div><div><strong>简历工坊</strong><small>RESUME WORKSHOP</small></div></div>
    <div className="sidebar-label">工作空间</div><nav>
      <button className={page === 'library' ? 'selected' : ''} onClick={() => setPage('library')}><span aria-hidden="true">▦</span>我的简历<b>{store.resumes.length}</b></button>
      <button className={page === 'editor' ? 'selected' : ''} disabled={!r} onClick={() => setPage('editor')}><span aria-hidden="true">▤</span>编辑工作台</button>
      <button className={page === 'settings' ? 'selected' : ''} onClick={() => setPage('settings')}><span aria-hidden="true">⚙</span>模型设置</button>
      <button className={page === 'help' ? 'selected' : ''} onClick={() => setPage('help')}><span aria-hidden="true">ⓘ</span>帮助与关于</button>
    </nav><div className="sidebar-bottom"><div className="local-note"><span className="status-dot"/>本地工作空间<p>你的资料，留在你的电脑。</p></div><small>简历工坊 v{VERSION}</small></div></aside>
    <main className="app-main">
      {store.warnings.length > 0 && <div className="global-warning">{store.warnings.map((w, i) => <p key={i}>{w}</p>)}<button onClick={() => store.setWarnings([])}>收起提示</button></div>}
      {page === 'library' && <div className="library"><header className="page-heading"><div><span className="eyebrow">MAKE YOUR NEXT CHAPTER</span><h1>我的简历<span className="heading-dot">.</span></h1><p>从零散的经历，到一份清晰的自我介绍。</p></div><div className="actions"><button onClick={importBackup}>导入备份</button><button className="primary" onClick={create}>＋ 新建简历</button></div></header>
        <div className="library-banner"><div><span className="tag">为下一次机会做好准备</span><h2>每一段经历，都值得被好好表达。</h2><p>手动制作，或接入自己的模型帮你整理。随时编辑，本地保存。</p></div><div className="banner-graphic" aria-hidden="true"><div className="mini-resume"><b/><i/><i/><hr/><i/><i/><i/></div><span>✦</span></div></div>
        <div className="library-subheading"><h3>全部简历</h3><span>{store.resumes.length} 份 · 最近编辑优先</span></div>
        <div className="resume-grid">{[...store.resumes].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(doc => <article className="resume-card" key={doc.id}>
          <button className="resume-cover" onClick={() => open(doc)} aria-label={'打开 ' + doc.name}><div className={'mini-resume ' + doc.display.template} style={{ '--accent': doc.display.color } as React.CSSProperties}><b/>{Array.from({ length: 8 }, (_, i) => <i key={i}/>)}</div><span>{TEMPLATES.find(t => t.id === doc.display.template)?.name}</span></button>
          <div className="resume-card-content"><div className="card-title"><button className="text-button" onClick={() => open(doc)}>{doc.name}</button>{doc.fictional && <span className="tag">虚构示例</span>}</div><p>{doc.target.role || '尚未设置求职方向'}</p><small>更新于 {new Date(doc.updatedAt).toLocaleString('zh-CN')}</small><div className="resume-card-actions"><button onClick={() => open(doc)}>打开</button><button onClick={() => rename(doc)}>重命名</button><button onClick={() => duplicate(doc)}>复制</button><button className="danger" onClick={() => remove(doc)}>删除</button></div></div>
        </article>)}<button className="new-resume-card" onClick={create}><span>＋</span><strong>开始一份新简历</strong><small>把你的下一步，写在这里</small></button></div>
      </div>}
      {page === 'settings' && <Settings config={store.config} onConfig={store.setConfig} notify={notify}/>}
      {page === 'help' && <div className="settings-page"><div className="section-intro"><span className="eyebrow">ABOUT THE WORKSHOP</span><h1>让经历成为清晰的表达</h1><p>简历自动生成 Agent · v{VERSION} · Windows x64</p></div><section className="help-card"><h3>制作流程</h3><ol><li>新建简历，填写资料和目标岗位。</li><li>逐条记录经历关键词、本人职责与可确认事实。</li><li>手动写描述，或配置模型后点击生成；核对并采用建议。</li><li>选择模板，使用 PDF 预览核对分页，再保存 PDF。</li></ol><h3>数据与密钥</h3><p>简历和照片自动保存到：<code>{store.directory}</code></p><p>不配置模型也能编辑和导出。AI 功能会将相关原始素材、已确认资料和岗位上下文发送给你配置的服务；不会发送姓名、电话、邮箱或照片。</p><p>密钥单独保存；选择记住时使用操作系统加密。建议定期导出 JSON 备份，备份可恢复照片，不含密钥。</p><h3>已知范围</h3><p>首版仅支持兼容 Chat Completions 基本格式的文本模型、PDF 和本应用 JSON 备份。AI 建议需人工核对；其他系统和真实服务兼容性以测试记录为准。</p><h3>开源信息</h3><p>MIT 许可，版权署名为 Resume Workshop contributors。源码、使用教程和问题反馈入口见项目 README；第三方许可见发行包内说明。</p></section></div>}
      {page === 'editor' && r && <div className="editor-page">
        <header className="editor-top"><div><button className="back-button" onClick={() => setPage('library')}>← 我的简历</button><div className="editor-title"><h2>{r.name}</h2><button className="icon-button" aria-label="重命名当前简历" onClick={() => rename(r)}>✎</button>{r.fictional && <span className="tag">虚构资料</span>}</div><div className="save-status" role="status"><span className={'status-dot ' + (store.statuses[r.id]?.startsWith('保存失败') ? 'red' : '')}/>{store.statuses[r.id] || '已保存'}{store.statuses[r.id]?.startsWith('保存失败') && <button onClick={() => store.flush()}>重试保存</button>}</div></div><div className="actions"><button onClick={backup}>JSON 备份</button><button disabled={pdfBusy} onClick={previewPDF}>PDF 预览</button><button className="preview-toggle" onClick={() => setPreviewVisible(v => !v)}>{previewVisible ? '收起预览' : '展开预览'}</button><button className="primary" disabled={pdfBusy} onClick={() => exportPDF()}>{pdfBusy ? '准备 PDF…' : '导出 PDF ↗'}</button></div></header>
        <div className="ai-toolbar"><div><span>✦</span><strong>让事实表达得更清晰</strong><small>点击 AI 操作会向你的模型服务发送相关素材，结果经你采用后写入。</small></div><div className="actions">{job && <button onClick={() => setAiOpen(true)}>{job.state === 'waiting' ? '查看生成进度' : '查看 AI 结果'}</button>}<button disabled={job?.state === 'waiting'} onClick={() => startAI('tailor')}>按岗位调整</button><button className="soft-primary" disabled={job?.state === 'waiting'} onClick={() => startAI('generate')}>✦ 生成简历文案</button></div></div>
        <div className={'workspace' + (!previewVisible ? ' preview-hidden' : '')}><aside className="module-nav"><span className="sidebar-label">简历内容</span><button className={module === 'basics' ? 'active' : ''} onClick={() => setModule('basics')}><span>01</span>基本资料</button>
        {r.display.order.map((id, i) => <div className={'module-item' + (module === id ? ' active' : '')} key={id}><button onClick={() => setModule(id)}><span>{String(i + 2).padStart(2, '0')}</span>{LABELS[id]}</button><div className="module-tools"><button aria-label={LABELS[id] + (r.display.hidden.includes(id) ? '显示模块' : '隐藏模块')} title={r.display.hidden.includes(id) ? '显示模块' : '隐藏模块'} onClick={() => edit(n => { n.display.hidden = n.display.hidden.includes(id) ? n.display.hidden.filter(v => v !== id) : [...n.display.hidden, id]; })}>{r.display.hidden.includes(id) ? '○' : '●'}</button><button aria-label={LABELS[id] + '上移模块'} disabled={i === 0} onClick={() => edit(n => { n.display.order = move(n.display.order, i, -1); })}>↑</button><button aria-label={LABELS[id] + '下移模块'} disabled={i === r.display.order.length - 1} onClick={() => edit(n => { n.display.order = move(n.display.order, i, 1); })}>↓</button><button className="danger" aria-label={'删除' + LABELS[id] + '模块'} onClick={() => removeModule(id)}>×</button></div></div>)}
        <select className="add-module" aria-label="添加简历模块" value="" onChange={event => { const id = event.target.value as ModuleId; if (id) { edit(n => { n.display.order.push(id); }); setModule(id); } }}><option value="">＋ 添加模块</option>{MODULES.filter(id => !r.display.order.includes(id)).map(id => <option key={id} value={id}>{LABELS[id]}</option>)}</select><p className="nav-hint">隐藏保留内容<br/>空模块自动省略</p></aside>
        <div className="editor-form"><Editor resume={r} module={module} edit={edit} confirm={confirm} ai={startAI} choosePhoto={photo}/></div>
        {previewVisible && <aside className="preview-panel"><div className="preview-title"><h3>简历预览</h3><span className="tag">A4</span><button disabled={pdfBusy} onClick={previewPDF}>PDF 分页预览</button></div><div className="template-options">{TEMPLATES.map(t => <button className={'template-option' + (r.display.template === t.id ? ' selected' : '')} key={t.id} onClick={() => edit(n => { n.display.template = t.id; })} title={t.description}><div className={'template-thumb ' + t.id}><i/><i/><i/></div><strong>{t.name}</strong><small>{t.description}</small></button>)}</div>
        <div className="preview-tools"><div className="colors">{COLORS.map(color => <button key={color} aria-label={'选择主题色 ' + color} className={r.display.color === color ? 'chosen' : ''} style={{ background: color }} onClick={() => edit(n => { n.display.color = color; })}/>)}</div><label className="check"><input type="checkbox" checked={r.display.showPhoto} onChange={event => edit(n => { n.display.showPhoto = event.target.checked; })}/>照片</label><label className="zoom-label">缩放<select aria-label="预览缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[0.4,0.52,0.65,0.8,1].map(v => <option key={v} value={v}>{Math.round(v*100)}%</option>)}</select></label></div>
        <div className="preview-scroll"><div className="paper-frame" style={{ width: 794 * zoom, height: previewHeight * zoom }}><iframe title="编辑简历预览" sandbox="allow-same-origin" srcDoc={resumeHtml(r)} onLoad={event => setPreviewHeight(Math.max(1123, event.currentTarget.contentDocument?.body.scrollHeight || 1123))} style={{ width: 794, height: previewHeight, transform: 'scale(' + zoom + ')', transformOrigin: 'top left' }}/></div></div><p className="preview-caption">编辑预览用于查看内容 · 真实分页请打开 PDF 预览</p></aside>}
        </div>
      </div>}
    </main>
    {toast && <div className={'toast' + (toast.bad ? ' bad' : '')} role={toast.bad ? 'alert' : 'status'}><span>{toast.message}</span><button aria-label="关闭提示" onClick={() => setToast(undefined)}>×</button></div>}
    {ask && <div className="overlay"><form className="modal compact" role="dialog" aria-modal="true" aria-label={ask.initial === undefined ? '确认删除' : '重命名简历'} onSubmit={event => { event.preventDefault(); resolveAsk(ask.initial === undefined ? true : askValue); }}><h3>{ask.initial === undefined ? '请确认操作' : '重命名简历'}</h3><p>{ask.message}</p>{ask.initial !== undefined && <input autoFocus aria-label="简历名称" value={askValue} maxLength={500} onChange={event => setAskValue(event.target.value)}/>}<div className="modal-footer"><button type="button" autoFocus={ask.initial === undefined} onClick={() => resolveAsk(null)}>取消</button><button className={ask.initial === undefined ? 'danger-primary' : 'primary'} disabled={ask.initial !== undefined && !askValue.trim()} type="submit">确定</button></div></form></div>}
    {aiOpen && r && job && <Suggestions key={job.requestId} resume={r} job={job} close={() => setAiOpen(false)} cancel={cancelAI} editSuggestion={suggestion => updateJob(r.id, { ...job, suggestion })} apply={adopt} answer={addFacts} regenerate={() => { const request = requests.current[r.id]; if (request) startAI(request.action, request.entryId); }}/>}
    {pdf && <div className="overlay"><section className="modal pdf-modal" role="dialog" aria-modal="true" aria-label="真实 PDF 预览"><div className="modal-heading"><div><h2>PDF 分页预览</h2><p>以下为实际导出文件 · 修订 {pdf.resume.revision}</p></div><div className="actions"><button disabled={pdfBusy} className="primary" onClick={() => exportPDF(pdf.resume)}>保存此 PDF</button><button className="icon-button" aria-label="关闭 PDF 预览" onClick={() => setPdf(undefined)}>×</button></div></div><iframe title="真实 PDF 分页预览" src={pdf.url}/></section></div>}
  </div>;
}




