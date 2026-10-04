import { useId, type ReactNode } from 'react';
import { newAward, newEducation, newExperience, newSkill, uid, move, validateResume, type Resume, type ModuleId } from '../shared/schema';
export type Edit = (mutate: (next: Resume) => void) => void;
export function Field({ label, value, onChange, multiline, hint, error, type = 'text', placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; hint?: string; error?: string; type?: string; placeholder?: string; maxLength?: number }) {
  const id = useId();
  const props = { id, value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value), placeholder, maxLength: maxLength ?? (multiline ? 20000 : 500), 'aria-invalid': !!error, 'aria-describedby': error || hint ? id + '-note' : undefined };
  return <div className={'field' + (multiline ? ' full' : '')}><label htmlFor={id}><span>{label}</span></label>{multiline ? <textarea {...props} rows={4}/> : <input {...props} type={type}/>} {(error || hint) && <small id={id + '-note'} className={error ? 'field-error' : ''}>{error || hint}</small>}</div>;
}
function Card({ title, visible, onVisibility, up, down, remove, index, count, children }: { title: string; visible: boolean; onVisibility: () => void; up: () => void; down: () => void; remove: () => void; index: number; count: number; children: ReactNode }) {
  return <section className={'entry-card' + (!visible ? ' hidden-entry' : '')}>
    <div className="card-heading"><strong>{title || '待填写条目'}</strong><div className="row-tools">
      <label className="check"><input type="checkbox" checked={visible} onChange={onVisibility}/>显示</label>
      <button className="icon-button" title="上移条目" aria-label="上移条目" onClick={up} disabled={index === 0}>↑</button>
      <button className="icon-button" title="下移条目" aria-label="下移条目" onClick={down} disabled={index === count - 1}>↓</button>
      <button className="icon-button danger" title="删除条目" aria-label="删除条目" onClick={remove}>×</button>
    </div></div><div className="fields">{children}</div>
  </section>;
}
export function Editor({ resume: r, module, edit, confirm, ai, choosePhoto }: { resume: Resume; module: 'basics' | ModuleId; edit: Edit; confirm: (message: string) => Promise<boolean>; ai: (action: 'questions' | 'polish' | 'shorten' | 'contribution', id: string) => void; choosePhoto: () => void }) {
  const errors = validateResume(r);
  const error = (path: string) => errors.find(e => e.path === path)?.message;
  const remove = async (what: string, action: (next: Resume) => void) => { if (await confirm('删除' + what + '及其已有内容？此操作不能撤销。')) edit(action); };
  if (module === 'basics') return <div className="form-content">
    <div className="section-intro"><span className="eyebrow">YOUR PROFILE</span><h2>先从认识你开始</h2><p>草稿可以随时保存，选填信息留空即可。</p></div>
    <section className="entry-card"><div className="fields">
      <Field label="姓名" value={r.basics.name} onChange={name => edit(n => { n.basics.name = name; })} placeholder="填写真实姓名"/>
      <Field label="求职方向" value={r.target.role} onChange={role => edit(n => { n.target.role = role; })} placeholder="例如：前端开发实习生"/>
      <Field label="电话" value={r.basics.phone} onChange={phone => edit(n => { n.basics.phone = phone; })} placeholder="手机号 / 联系电话"/>
      <Field label="邮箱" value={r.basics.email} onChange={email => edit(n => { n.basics.email = email; })} error={error('basics.email')} placeholder="name@example.com"/>
      <Field label="所在城市（选填）" value={r.basics.city} onChange={city => edit(n => { n.basics.city = city; })} placeholder="例如：杭州"/>
      <Field label="作品 / 个人网站（选填）" value={r.basics.website} onChange={website => edit(n => { n.basics.website = website; })} error={error('basics.website')} placeholder="https://"/>
      <div className="full photo-picker">{r.basics.photo && <img src={r.basics.photo.dataUrl} alt="已选择的个人照片"/>}<div><strong>个人照片（选填）</strong><p>PNG / JPEG，最大 5 MB。照片随草稿保存。</p><div className="actions"><button onClick={choosePhoto}>{r.basics.photo ? '更换照片' : '选择照片'}</button>{r.basics.photo && <button onClick={() => remove('照片', n => { n.basics.photo = null; })}>移除照片</button>}</div></div></div>
    </div></section>
    <section className="entry-card"><div className="card-heading"><strong>岗位上下文</strong><span className="tag">仅用于 AI 参考</span></div><div className="fields"><Field label="招聘描述（选填）" value={r.target.jobDescription} onChange={jobDescription => edit(n => { n.target.jobDescription = jobDescription; })} multiline placeholder="粘贴岗位职责与要求，AI 将依据已有事实调整表达。" hint="不会因为招聘要求提到某项技能，就自动写成你已掌握。"/></div></section>
  </div>;
  if (module === 'summary') return <div className="form-content"><div className="section-intro"><span className="eyebrow">A FEW WORDS ABOUT YOU</span><h2>个人简介</h2><p>两到三句话，讲清你的背景、实践与求职方向。</p></div><section className="entry-card"><Field label="正式简介（选填）" value={r.summary} onChange={summary => edit(n => { n.summary = summary; })} multiline placeholder="可以手动填写，也可以通过上方生成按钮获得待确认的建议。"/></section></div>;
  let entries: ReactNode[] = [];
  let add: () => void;
  let label: string;
  if (module === 'education') {
    label = '教育背景'; add = () => edit(n => { n.education.push(newEducation()); });
    entries = r.education.map((e, i) => {
      const update = (key: string, value: string | boolean) => edit(n => { Object.assign(n.education.find(v => v.id === e.id)!, { [key]: value }); });
      return <Card key={e.id} title={e.school || '教育 ' + (i + 1)} visible={e.visible} index={i} count={r.education.length} onVisibility={() => update('visible', !e.visible)} up={() => edit(n => { n.education = move(n.education, i, -1); })} down={() => edit(n => { n.education = move(n.education, i, 1); })} remove={() => remove('这条教育经历', n => { n.education = n.education.filter(v => v.id !== e.id); })}>
        <Field label="学校" value={e.school} onChange={v => update('school', v)}/>
        <Field label="学历" value={e.degree} onChange={v => update('degree', v)} placeholder="本科 / 硕士"/>
        <Field label="专业" value={e.major} onChange={v => update('major', v)}/>
        <label className="check align-bottom"><input type="checkbox" checked={e.current} onChange={() => update('current', !e.current)}/>目前在读</label>
        <Field label="开始年月" value={e.start} onChange={v => update('start', v)} type="month" error={error(e.id + '.start')}/>
        <Field label={e.current ? '预计毕业年月（留空显示至今）' : '结束年月'} value={e.end} onChange={v => update('end', v)} type="month" error={error(e.id + '.end')}/>
        <Field label="GPA（选填）" value={e.gpa} onChange={v => update('gpa', v)} error={error(e.id + '.gpa')} placeholder="3.8"/>
        <Field label="GPA 满分" value={e.gpaMax} onChange={v => update('gpaMax', v)} placeholder="4.0"/>
        <Field label="百分制成绩（选填）" value={e.score} onChange={v => update('score', v)} error={error(e.id + '.score')} hint="独立标注，不与 GPA 换算"/>
        <Field label="专业排名（选填）" value={e.rank} onChange={v => update('rank', v)} placeholder="例如：12 / 120"/>
        <Field label="相关课程（选填）" value={e.courses} onChange={v => update('courses', v)} multiline/>
      </Card>;
    });
  } else if (module === 'awards') {
    label = '荣誉奖项'; add = () => edit(n => { n.awards.push(newAward()); });
    entries = r.awards.map((e, i) => {
      const update = (key: string, value: string | boolean) => edit(n => { Object.assign(n.awards.find(v => v.id === e.id)!, { [key]: value }); });
      return <Card key={e.id} title={e.name || '奖项 ' + (i + 1)} visible={e.visible} index={i} count={r.awards.length} onVisibility={() => update('visible', !e.visible)} up={() => edit(n => { n.awards = move(n.awards, i, -1); })} down={() => edit(n => { n.awards = move(n.awards, i, 1); })} remove={() => remove('这条奖项', n => { n.awards = n.awards.filter(v => v.id !== e.id); })}>
        <Field label="奖项名称" value={e.name} onChange={v => update('name', v)}/><Field label="颁发机构（选填）" value={e.organization} onChange={v => update('organization', v)}/>
        <Field label="获得年月（选填）" value={e.date} onChange={v => update('date', v)} type="month" error={error(e.id + '.date')}/><Field label="奖项级别（选填）" value={e.level} onChange={v => update('level', v)} hint="不确定时留空"/>
        <Field label="补充描述（选填）" value={e.description} onChange={v => update('description', v)} multiline/>
      </Card>;
    });
  } else if (module === 'skills') {
    label = '技能与证书'; add = () => edit(n => { n.skills.push(newSkill()); });
    entries = r.skills.map((e, i) => {
      const update = (key: string, value: string | boolean) => edit(n => { Object.assign(n.skills.find(v => v.id === e.id)!, { [key]: value }); });
      return <Card key={e.id} title={e.name || '技能 ' + (i + 1)} visible={e.visible} index={i} count={r.skills.length} onVisibility={() => update('visible', !e.visible)} up={() => edit(n => { n.skills = move(n.skills, i, -1); })} down={() => edit(n => { n.skills = move(n.skills, i, 1); })} remove={() => remove('这条技能', n => { n.skills = n.skills.filter(v => v.id !== e.id); })}>
        <Field label="技能 / 证书名称" value={e.name} onChange={v => update('name', v)}/><Field label="类别（选填）" value={e.category} onChange={v => update('category', v)} placeholder="开发语言 / 专业证书"/>
        <Field label="熟练程度 / 补充说明" value={e.detail} onChange={v => update('detail', v)} multiline hint="填写你能确认的实际能力与熟练程度"/>
      </Card>;
    });
  } else {
    label = { project: '项目经历', work: '实习 / 工作', campus: '校园经历' }[module];
    add = () => edit(n => { n.experiences.push(newExperience(module)); });
    const group = r.experiences.filter(e => e.kind === module);
    const reorder = (i: number, delta: number) => edit(n => {
      const positions = n.experiences.map((e, index) => e.kind === module ? index : -1).filter(v => v >= 0);
      const a = positions[i], b = positions[i + delta]; [n.experiences[a], n.experiences[b]] = [n.experiences[b], n.experiences[a]];
    });
    entries = group.map((e, i) => {
      const update = (key: string, value: string | boolean) => edit(n => { Object.assign(n.experiences.find(v => v.id === e.id)!, { [key]: value }); });
      return <Card key={e.id} title={e.name || '经历 ' + (i + 1)} visible={e.visible} index={i} count={group.length} onVisibility={() => update('visible', !e.visible)} up={() => reorder(i, -1)} down={() => reorder(i, 1)} remove={() => remove('这条经历及原始素材', n => { n.experiences = n.experiences.filter(v => v.id !== e.id); })}>
        <Field label="经历名称" value={e.name} onChange={v => update('name', v)} placeholder="项目 / 职位 / 活动名称"/>
        <Field label="所属组织 / 单位" value={e.organization} onChange={v => update('organization', v)}/>
        <Field label="担任角色 / 个人职责" value={e.role} onChange={v => update('role', v)}/>
        <label className="check align-bottom"><input type="checkbox" checked={e.current} onChange={() => update('current', !e.current)}/>目前仍在进行</label>
        <Field label="开始年月" value={e.start} onChange={v => update('start', v)} type="month" error={error(e.id + '.start')}/>
        <Field label="结束年月（进行中可留空）" value={e.end} onChange={v => update('end', v)} type="month" error={error(e.id + '.end')}/>
        <Field label="技术 / 工具 / 方法（选填）" value={e.tools} onChange={v => update('tools', v)} multiline/>
        <div className="material-box full"><span className="tag">原始素材 · 始终保留</span><Field label="原始关键词 / 口语描述" value={e.keywords} onChange={v => update('keywords', v)} multiline placeholder="例如：校园二手交易平台，Vue、MySQL，负责登录和商品发布"/>
        <Field label="已确认事实" value={e.facts} onChange={v => update('facts', v)} multiline hint="只记录你能确认的职责、行动、方法与结果。AI 文案不会自动加入这里。"/>
        <button onClick={() => ai('questions', e.id)}>✦ 帮我补充经历</button></div>
        <div className="full formal-copy"><div className="card-heading"><strong>正式描述条目</strong><span className="muted">将显示在简历中</span></div>
        {e.bullets.map((b, j) => <div className="bullet-editor" key={b.id}><textarea aria-label={'正式描述 ' + (j + 1)} value={b.text} maxLength={20000} rows={3} onChange={event => edit(n => { n.experiences.find(v => v.id === e.id)!.bullets.find(v => v.id === b.id)!.text = event.target.value; })}/><div className="row-tools">
          <button aria-label="上移描述" disabled={j === 0} onClick={() => edit(n => { const target = n.experiences.find(v => v.id === e.id)!; target.bullets = move(target.bullets, j, -1); })}>↑</button>
          <button aria-label="下移描述" disabled={j === e.bullets.length - 1} onClick={() => edit(n => { const target = n.experiences.find(v => v.id === e.id)!; target.bullets = move(target.bullets, j, 1); })}>↓</button>
          <button aria-label="删除描述" onClick={() => remove('这条描述', n => { const target = n.experiences.find(v => v.id === e.id)!; target.bullets = target.bullets.filter(v => v.id !== b.id); })}>×</button>
        </div></div>)}
        <button className="text-button" onClick={() => edit(n => { n.experiences.find(v => v.id === e.id)!.bullets.push({ id: uid(), text: '' }); })}>＋ 添加描述条目</button>
        <div className="ai-actions">{(['polish', 'shorten', 'contribution'] as const).map((action, j) => <button key={action} onClick={() => ai(action, e.id)}>✦ {['优化表达', '精简内容', '突出个人贡献'][j]}</button>)}</div></div>
      </Card>;
    });
  }
  return <div className="form-content"><div className="section-intro"><span className="eyebrow">BUILD YOUR STORY</span><h2>{label}</h2><p>保留每一次实践，让事实清晰地表达你的能力。</p></div>{entries.length ? entries : <div className="empty-card"><div className="empty-mark">＋</div><h3>从第一条{label}开始</h3><p>先填写关键词也可以，之后再补充和整理。</p></div>}<button className="add-card" onClick={add}>＋ 添加{label}</button></div>;
}

