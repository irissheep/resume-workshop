import { useState } from 'react';
import { canApply } from '../shared/ai';
import { LABELS, type Resume, type Suggestion } from '../shared/schema';
export interface Job { requestId: string; state: 'waiting' | 'success' | 'failed' | 'cancelled'; suggestion?: Suggestion; error?: string }
export function Suggestions({ resume, job, close, cancel, editSuggestion, apply, answer, regenerate }: { resume: Resume; job: Job; close: () => void; cancel: () => void; editSuggestion: (suggestion: Suggestion) => void; apply: (scope: string) => void; answer: (entryId: string, facts: string) => void; regenerate: () => void }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const s = job.suggestion;
  const stale = !!s && !canApply(resume, s);
  const hasCopy = s && (s.entries.length > 0 || s.summary !== undefined || !!s.order);
  return <div className="overlay" onClick={close}><section className="suggestions modal large" role="dialog" aria-modal="true" aria-label="AI 建议" onClick={event => event.stopPropagation()}>
    <div className="modal-heading"><div><span className="eyebrow">YOUR AI ASSISTANT</span><h2>先核对，再采用</h2></div><button className="icon-button" aria-label="关闭 AI 建议" onClick={close}>×</button></div>
    <p className="muted">建议只整理表达，事实与个人贡献仍需你确认。原始资料始终保留。</p>
    {job.state === 'waiting' && <div className="waiting-state"><span className="spinner"/><h3>正在整理你的经历…</h3><p>你可以关闭此区域继续编辑，最长等待 60 秒。</p><button onClick={cancel}>取消当前请求</button></div>}
    {(job.state === 'failed' || job.state === 'cancelled') && <div className="error-box"><strong>{job.state === 'cancelled' ? '已取消' : '生成失败'}</strong><p>{job.error}</p><button onClick={regenerate}>重新发起请求</button></div>}
    {stale && <div className="error-box"><strong>基于较早内容生成</strong><p>当前简历已修改，直接采用已禁用。请依据最新资料重新生成。</p><button onClick={regenerate}>重新生成</button></div>}
    {s?.warnings.map((warning, i) => <p className="notice" key={i}>{warning.sourceEntryId ? (resume.experiences.find(e => e.id === warning.sourceEntryId)?.name || '经历') + '：' : ''}{warning.text}</p>)}
    {s?.summary !== undefined && <section className="suggestion-card"><h3>个人简介</h3><div className="diff"><div><span>当前文案</span><p>{resume.summary || '尚未填写'}</p></div><div><span>建议文案 · 可编辑</span><textarea aria-label="建议简介" value={s.summary} rows={5} maxLength={4000} onChange={event => editSuggestion({ ...s, summary: event.target.value })}/></div></div><button disabled={stale} onClick={() => apply('summary')}>采用个人简介</button></section>}
    {s?.entries.map((entry, i) => <section key={entry.sourceEntryId} className="suggestion-card"><h3>{resume.experiences.find(e => e.id === entry.sourceEntryId)?.name || '当前经历'}</h3><div className="diff"><div><span>当前描述</span><ul>{resume.experiences.find(e => e.id === entry.sourceEntryId)?.bullets.filter(b => b.text.trim()).map(b => <li key={b.id}>{b.text}</li>)}</ul></div><div><span>建议描述 · 每条可编辑</span>{entry.bullets.map((bullet, j) => <textarea aria-label={'建议描述 ' + (i + 1) + '-' + (j + 1)} key={j} rows={3} value={bullet} maxLength={4000} onChange={event => editSuggestion({ ...s, entries: s.entries.map((e, k) => k === i ? { ...e, bullets: e.bullets.map((v, n) => n === j ? event.target.value : v) } : e) })}/>)}</div></div><button disabled={stale} onClick={() => apply(entry.sourceEntryId)}>采用此经历描述</button></section>)}
    {s?.order && <section className="suggestion-card"><h3>推荐模块顺序</h3><p>{s.order.map(id => LABELS[id]).join(' → ')}</p><button disabled={stale} onClick={() => apply('order')}>采用模块顺序</button></section>}
    {s?.questions.map(group => <section className="suggestion-card" key={group.sourceEntryId}><h3>补充已确认的事实</h3>{group.questions.map((q, i) => <label className="field" key={i}><span>{q}</span><textarea aria-label={q} rows={3} maxLength={4000} value={answers[i] || ''} onChange={event => setAnswers(a => ({ ...a, [i]: event.target.value }))} placeholder="可以留空或跳过"/></label>)}<div className="actions"><button className="primary" disabled={stale || !Object.values(answers).some(v => v.trim())} onClick={() => {
      const facts = group.questions.map((q, i) => answers[i]?.trim() ? q + '\n' + answers[i].trim() : '').filter(Boolean).join('\n\n');
      answer(group.sourceEntryId, facts);
    }}>确认并加入此经历事实</button><button onClick={close}>跳过本轮问题</button></div><p className="muted">确认后不会自动生成；再次点击生成或改写即可使用补充资料。</p></section>)}
    {job.state === 'success' && !hasCopy && !s?.questions.length && <p className="success-box">本次建议已采用，你可以继续编辑。</p>}
    {hasCopy && <div className="modal-footer"><button onClick={close}>暂不采用，返回编辑</button><button disabled={stale} className="primary" onClick={() => apply('all')}>采用全部待确认文案{ s.entries.length ? '（' + s.entries.length + ' 段经历）' : ''}</button></div>}
  </section></div>;
}
