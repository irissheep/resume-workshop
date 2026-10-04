import { useEffect, useRef, useState } from 'react';
import type { Resume, PublicConfig } from '../shared/schema';
export function useResumes() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [config, setConfig] = useState<PublicConfig>();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [directory, setDirectory] = useState('');
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const documents = useRef<Resume[]>([]);
  const pending = useRef(new Map<string, Resume>());
  const tail = useRef(Promise.resolve(true));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  function status(id: string, text: string) { if (mounted.current) setStatuses(s => ({ ...s, [id]: text })); }
  function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    const snapshot = [...pending.current.values()]; pending.current.clear();
    const operation = tail.current.then(async () => {
      let success = true;
      for (const resume of snapshot) {
        try {
          await window.desktop.save(resume);
          const latest = documents.current.find(r => r.id === resume.id);
          if ((pending.current.get(resume.id)?.revision ?? Infinity) <= resume.revision) pending.current.delete(resume.id);
          status(resume.id, latest?.revision === resume.revision && !pending.current.has(resume.id) ? '已保存' : '保存中');
        } catch (error) {
          success = false;
          const latest = documents.current.find(r => r.id === resume.id);
          if (latest && !pending.current.has(resume.id)) pending.current.set(resume.id, latest);
          status(resume.id, '保存失败：' + (error as Error).message);
        }
      }
      return success;
    });
    tail.current = operation; return operation;
  }
  flushRef.current = flush;
  function put(resume: Resume) {
    const exists = documents.current.some(r => r.id === resume.id);
    documents.current = exists ? documents.current.map(r => r.id === resume.id ? resume : r) : [...documents.current, resume];
    setResumes(documents.current);
    pending.current.set(resume.id, resume); status(resume.id, '保存中');
    clearTimeout(timer.current); timer.current = setTimeout(() => void flushRef.current(), 800);
  }
  async function remove(id: string) {
    if (!await flushRef.current()) throw new Error('保存失败，请先重试保存或导出备份');
    await window.desktop.remove(id);
    pending.current.delete(id); documents.current = documents.current.filter(r => r.id !== id); setResumes(documents.current);
  }
  function addImported(r: Resume) { documents.current = [...documents.current, r]; setResumes(documents.current); status(r.id, '已保存'); }
  useEffect(() => {
    mounted.current = true;
    if (!window.desktop) { setFatal('请使用桌面程序启动，或运行 npm run dev。普通浏览器无法进行本地文件操作。'); return; }
    window.desktop.bootstrap().then(result => {
      documents.current = result.resumes; setResumes(result.resumes); setConfig(result.config);
      setWarnings(result.warnings); setDirectory(result.dataDirectory); setReady(true);
    }).catch(error => setFatal((error as Error).message));
    const unsubscribe = window.desktop.onClose(async () => {
      let success = await flushRef.current();
      while (success && pending.current.size) success = await flushRef.current();
      window.desktop.closeReady(success);
      if (!success) setWarnings(w => [...w, '关闭前保存失败，应用保持打开。请重试保存或导出 JSON 备份后再关闭。']);
    });
    return () => { mounted.current = false; clearTimeout(timer.current); unsubscribe(); };
  }, []);
  return { resumes, documents, config, setConfig, ready, fatal, warnings, setWarnings, directory, statuses, put, flush, remove, addImported };
}

