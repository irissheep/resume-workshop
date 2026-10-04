import { z } from 'zod';

export const VERSION = '0.1.0';
export const MODULES = ['summary', 'education', 'project', 'work', 'campus', 'awards', 'skills'] as const;
export type ModuleId = typeof MODULES[number];
export const LABELS: Record<ModuleId, string> = { summary: '个人简介', education: '教育背景', project: '项目经历', work: '实习 / 工作', campus: '校园经历', awards: '荣誉奖项', skills: '技能与证书' };
export const COLORS = ['#25635a', '#244976', '#774761', '#333333'] as const;
const short = z.string().max(500);
const text = z.string().max(20000);
const id = z.string().uuid();
const month = z.string().max(20);
const baseEntry = { id, visible: z.boolean() };
const description = z.object({ id, text: text });
export const photoSchema = z.object({
  dataUrl: z.string().max(7_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/, '照片必须为 PNG/JPEG'),
  name: short
});
export const educationSchema = z.object({
  ...baseEntry, school: short, degree: short, major: short,
  start: month, end: month, current: z.boolean(), gpa: short, gpaMax: short,
  score: short, rank: short, courses: text
});
export const experienceSchema = z.object({
  ...baseEntry, kind: z.enum(['project', 'work', 'campus']), name: short, organization: short,
  start: month, end: month, current: z.boolean(), role: short, tools: text,
  keywords: text, facts: text, bullets: z.array(description).max(200)
});
export const awardSchema = z.object({ ...baseEntry, name: short, organization: short, date: month, level: short, description: text });
export const skillSchema = z.object({ ...baseEntry, name: short, category: short, detail: text });
export const resumeSchema = z.object({
  schemaVersion: z.literal(1), id, name: short.min(1), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(), fictional: z.boolean(),
  basics: z.object({ name: short, phone: short, email: short, city: short, website: short, photo: photoSchema.nullable() }),
  target: z.object({ role: short, jobDescription: text }), summary: text,
  education: z.array(educationSchema).max(150), experiences: z.array(experienceSchema).max(150),
  awards: z.array(awardSchema).max(150), skills: z.array(skillSchema).max(150),
  display: z.object({
    template: z.enum(['simple', 'business', 'campus']), color: z.enum(COLORS), showPhoto: z.boolean(),
    order: z.array(z.enum(MODULES)).max(MODULES.length).refine(v => new Set(v).size === v.length, '模块顺序不能重复'),
    hidden: z.array(z.enum(MODULES)).max(MODULES.length)
  })
}).superRefine((r, ctx) => {
  const ids = [r.id, ...r.education.map(v => v.id), ...r.experiences.flatMap(v => [v.id, ...v.bullets.map(b => b.id)]), ...r.awards.map(v => v.id), ...r.skills.map(v => v.id)];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: '文档内的条目 ID 必须唯一' });
});
export type Resume = z.infer<typeof resumeSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Award = z.infer<typeof awardSchema>;
export type Skill = z.infer<typeof skillSchema>;
export const uid = () => globalThis.crypto.randomUUID();
export function newResume(name = '未命名简历'): Resume {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: uid(), name, createdAt: now, updatedAt: now, revision: 0, fictional: false,
    basics: { name: '', phone: '', email: '', city: '', website: '', photo: null }, target: { role: '', jobDescription: '' }, summary: '',
    education: [], experiences: [], awards: [], skills: [],
    display: { template: 'simple', color: COLORS[0], showPhoto: true, order: [...MODULES], hidden: [] } };
}
export function newEducation(): Education {
  return { id: uid(), visible: true, school: '', degree: '', major: '', start: '', end: '', current: false, gpa: '', gpaMax: '', score: '', rank: '', courses: '' };
}
export function newExperience(kind: Experience['kind']): Experience {
  return { id: uid(), visible: true, kind, name: '', organization: '', start: '', end: '', current: false, role: '', tools: '', keywords: '', facts: '', bullets: [] };
}
export function newAward(): Award { return { id: uid(), visible: true, name: '', organization: '', date: '', level: '', description: '' }; }
export function newSkill(): Skill { return { id: uid(), visible: true, name: '', category: '', detail: '' }; }
export function cloneResume(input: Resume, name = input.name + ' - 副本'): Resume {
  const r = resumeSchema.parse(input);
  r.id = uid(); r.name = name; r.revision = 0; r.createdAt = r.updatedAt = new Date().toISOString();
  for (const entry of [...r.education, ...r.experiences, ...r.awards, ...r.skills]) entry.id = uid();
  for (const e of r.experiences) for (const b of e.bullets) b.id = uid();
  return r;
}
export interface FieldError { path: string; message: string }
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
export function validateResume(r: Resume, mode: 'draft' | 'generate' | 'export' = 'draft'): FieldError[] {
  const errors: FieldError[] = [];
  const add = (path: string, message: string) => errors.push({ path, message });
  if (r.basics.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.basics.email)) add('basics.email', '请输入有效的邮箱地址');
  if (r.basics.website && !/^https?:\/\/\S+$/i.test(r.basics.website)) add('basics.website', '链接需要以 https:// 或 http:// 开头');
  for (const e of [...r.education, ...r.experiences]) {
    if (e.start && !validMonth(e.start)) add(e.id + '.start', '日期格式应为 YYYY-MM');
    if (e.end && !validMonth(e.end)) add(e.id + '.end', '日期格式应为 YYYY-MM');
    if (e.start && e.end && e.end < e.start) add(e.id + '.end', '结束年月不能早于开始年月');
  }
  for (const e of r.education) {
    if (e.gpa || e.gpaMax) {
      if (!e.gpa || !e.gpaMax || !/^\d+(\.\d+)?$/.test(e.gpa) || !/^\d+(\.\d+)?$/.test(e.gpaMax) || Number(e.gpaMax) <= 0 || Number(e.gpa) > Number(e.gpaMax)) add(e.id + '.gpa', '请同时填写 GPA 与满分，且 0 ≤ GPA ≤ 满分');
    }
    if (e.score && (!/^\d+(\.\d+)?$/.test(e.score) || Number(e.score) > 100)) add(e.id + '.score', '百分制成绩应在 0–100 之间');
  }
  for (const a of r.awards) if (a.date && !validMonth(a.date)) add(a.id + '.date', '日期格式应为 YYYY-MM');
  if (mode === 'export') {
    if (!r.basics.name.trim()) add('basics.name', '导出前请填写姓名');
    if (!MODULES.some(m => moduleHasContent(r, m))) add('body', '请至少填写一个可展示的正文模块');
  }
  return errors;
}
export function moduleHasContent(r: Resume, module: ModuleId): boolean {
  if (!r.display.order.includes(module) || r.display.hidden.includes(module)) return false;
  if (module === 'summary') return !!r.summary.trim();
  if (module === 'education') return r.education.some(e => e.visible && [e.school, e.major, e.degree, e.courses].some(v => v.trim()));
  if (module === 'awards') return r.awards.some(e => e.visible && [e.name, e.description].some(v => v.trim()));
  if (module === 'skills') return r.skills.some(e => e.visible && [e.name, e.detail].some(v => v.trim()));
  return r.experiences.some(e => e.kind === module && e.visible && [e.name, e.organization, e.role, ...e.bullets.map(b => b.text)].some(v => v.trim()));
}
export function move<T>(items: T[], index: number, delta: number): T[] {
  const result = [...items]; const next = index + delta;
  if (index < 0 || next < 0 || next >= items.length) return result;
  [result[index], result[next]] = [result[next], result[index]]; return result;
}
export const configSchema = z.object({ name: short, baseUrl: z.string().max(2000), model: short.min(1), remember: z.boolean(), apiKey: z.string().max(2000).optional() });
export type ModelConfig = z.infer<typeof configSchema>;
export type PublicConfig = Omit<ModelConfig, 'apiKey'> & { keyAvailable: boolean; encryptionAvailable: boolean; warning?: string };
export type Action = 'generate' | 'questions' | 'polish' | 'shorten' | 'contribution' | 'tailor';
export const aiRequestSchema = z.object({ requestId: id, resume: resumeSchema, action: z.enum(['generate', 'questions', 'polish', 'shorten', 'contribution', 'tailor']), entryId: id.optional() });
export type AIRequest = z.infer<typeof aiRequestSchema>;
export interface Suggestion {
  requestId: string; resumeId: string; revision: number; action: Action;
  entries: { sourceEntryId: string; bullets: string[] }[]; summary?: string;
  questions: { sourceEntryId: string; questions: string[] }[]; order?: ModuleId[];
  warnings: { sourceEntryId?: string; text: string }[];
}
export type AIReply = { status: 'success'; suggestion: Suggestion } | { status: 'failed' | 'cancelled'; error: string };
export interface Bootstrap { resumes: Resume[]; warnings: string[]; config: PublicConfig; dataDirectory: string; version: string }
export interface DesktopAPI {
  bootstrap(): Promise<Bootstrap>; save(resume: Resume): Promise<void>; remove(id: string): Promise<void>;
  importBackup(): Promise<Resume | null>; exportBackup(resume: Resume): Promise<string | null>;
  choosePhoto(): Promise<Resume['basics']['photo']>; pdf(resume: Resume): Promise<string>;
  savePdf(resume: Resume): Promise<string | null>; saveConfig(config: ModelConfig): Promise<PublicConfig>;
  clearKey(): Promise<PublicConfig>; testConnection(): Promise<string>;
  ai(request: AIRequest): Promise<AIReply>; cancel(requestId: string): Promise<void>;
  onClose(callback: () => void): () => void; closeReady(success: boolean): void;
}

