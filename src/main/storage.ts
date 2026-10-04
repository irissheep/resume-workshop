import { mkdir, readFile, readdir, rename, rm, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { resumeSchema, cloneResume, type Resume } from '../shared/schema';
export const BACKUP_LIMIT = 10 * 1024 * 1024;
export async function atomicWrite(filename: string, data: string | Buffer): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temp = filename + '.' + crypto.randomUUID() + '.tmp';
  try {
    const handle = await open(temp, 'wx');
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, filename);
  } finally { await rm(temp, { force: true }); }
}
export function parseBackup(data: string): Resume {
  if (Buffer.byteLength(data, 'utf8') > BACKUP_LIMIT) throw new Error('备份超过 10 MB 上限');
  try { return resumeSchema.parse(JSON.parse(data)); }
  catch { throw new Error('备份格式无效、版本不支持或条目不合法；已有简历保持完整'); }
}
export class ResumeStore {
  readonly directory: string;
  private tail = Promise.resolve();
  private revisions = new Map<string, number>();
  private corrupt = new Set<string>();
  private deleted = new Set<string>();
  constructor(root: string, private write = atomicWrite) { this.directory = path.join(root, 'resumes'); }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(operation); this.tail = task.then(() => undefined, () => undefined); return task;
  }
  async load(): Promise<{ resumes: Resume[]; warnings: string[] }> {
    await mkdir(this.directory, { recursive: true });
    const filenames = await readdir(this.directory); const resumes: Resume[] = []; const warnings: string[] = [];
    for (const name of filenames.filter(n => n.endsWith('.json'))) {
      try {
        if ((await stat(path.join(this.directory, name))).size > BACKUP_LIMIT) throw new Error('too large');
        const r = parseBackup(await readFile(path.join(this.directory, name), 'utf8'));
        if (name !== r.id + '.json') throw new Error('ID mismatch');
        resumes.push(r); this.revisions.set(r.id, r.revision);
      } catch {
        this.corrupt.add(name.replace(/\.json$/, ''));
        warnings.push('无法读取 ' + name + '，原文件已保留。请从 JSON 备份恢复为新简历，或先复制原文件后检查数据。');
      }
    }
    return { resumes, warnings };
  }
  save(input: unknown): Promise<void> {
    const r = resumeSchema.parse(input);
    return this.enqueue(async () => {
      if (this.corrupt.has(r.id)) throw new Error('原草稿损坏，已保留文件，不能直接覆盖');
      if (this.deleted.has(r.id)) throw new Error('简历已删除，不能保存旧状态');
      if ((this.revisions.get(r.id) ?? -1) > r.revision) throw new Error('保存的版本早于当前草稿');
      await this.write(path.join(this.directory, r.id + '.json'), JSON.stringify(r, null, 2));
      this.revisions.set(r.id, r.revision);
    });
  }
  remove(id: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('无效的简历 ID');
    return this.enqueue(async () => {
      await rm(path.join(this.directory, id + '.json'));
      this.deleted.add(id); this.revisions.delete(id);
    });
  }
  async import(data: string): Promise<Resume> { const r = cloneResume(parseBackup(data)); await this.save(r); return r; }
  async flush(): Promise<void> { await this.tail; }
}
