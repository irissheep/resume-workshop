import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ResumeStore, atomicWrite } from '../src/main/storage';
import { ModelSettings, chat, completionUrl, type Encryption } from '../src/main/model';
import { sampleResume } from '../src/shared/samples';
const roots: string[] = [];
async function directory() { const root = await mkdtemp(path.join(os.tmpdir(), '简历 测试-')); roots.push(root); return root; }
// 测试目录保留在项目 .cache/temp，便于检查失败现场。
afterEach(() => { roots.length = 0; });
describe('真实文件保存与恢复', () => {
  it('排队保存不回退版本，重启读取一致，临时文件已替换', async () => {
    const root = await directory(); const store = new ResumeStore(root); await store.load();
    const r = sampleResume(); const newer = structuredClone(r); newer.revision = 2; newer.summary = '新内容';
    await Promise.all([store.save(r), store.save(newer)]);
    await expect(store.save(r)).rejects.toThrow('早于');
    const loaded = await new ResumeStore(root).load(); expect(loaded.resumes[0].summary).toBe('新内容');
    expect((await readdir(store.directory)).filter(n => n.endsWith('.tmp'))).toEqual([]);
  });
  it('写入失败向调用方报错，重试成功后才恢复', async () => {
    let fail = true;
    const store = new ResumeStore(await directory(), async (filename, data) => { if (fail) throw new Error('disk full'); await atomicWrite(filename, data); });
    await store.load(); const r = sampleResume();
    await expect(store.save(r)).rejects.toThrow('disk full');
    expect((await store.load()).resumes).toEqual([]);
    fail = false; await store.save(r); expect((await store.load()).resumes[0].id).toBe(r.id);
  });
  it('损坏文件保留且无法被保存覆盖', async () => {
    const root = await directory(); const store = new ResumeStore(root); await store.load();
    const r = sampleResume(); const filename = path.join(store.directory, r.id + '.json');
    await writeFile(filename, '{broken'); const loaded = await store.load();
    expect(loaded.warnings.length).toBe(1); expect(loaded.resumes).toEqual([]);
    await expect(store.save(r)).rejects.toThrow('损坏'); expect(await readFile(filename, 'utf8')).toBe('{broken');
  });
  it('恢复新 ID，删除后拒绝晚到的保存', async () => {
    const store = new ResumeStore(await directory()); await store.load(); const r = sampleResume();
    await store.save(r); const imported = await store.import(JSON.stringify(r));
    expect(imported.id).not.toBe(r.id); expect(imported.experiences[0].id).not.toBe(r.experiences[0].id);
    await store.remove(r.id); await expect(store.save(r)).rejects.toThrow('已删除');
    expect((await store.load()).resumes.map(v => v.id)).toEqual([imported.id]);
  });
});
const encrypted: Encryption = {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(value.split('').reverse().join('')),
  decryptString: value => value.toString().split('').reverse().join('')
};
describe('模型配置与请求', () => {
  it('拼接路径不自动加 v1，远程 HTTP 与凭据 URL 拒绝', () => {
    expect(completionUrl('https://example.com/v1///')).toBe('https://example.com/v1/chat/completions');
    expect(completionUrl('http://127.0.0.1:1234')).toBe('http://127.0.0.1:1234/chat/completions');
    expect(completionUrl('http://[::1]:1234')).toBe('http://[::1]:1234/chat/completions');
    expect(() => completionUrl('http://example.com')).toThrow('HTTPS');
    expect(() => completionUrl('https://user:secret@example.com')).toThrow();
  });
  it('会话密钥不落盘，记住时加密，清除后不可恢复', async () => {
    const root = await directory(); const settings = new ModelSettings(root, encrypted); await settings.load();
    const apiKey = 'fake-test-key-not-a-credential';
    const config = { name: '', baseUrl: 'https://example.com', model: 'text', remember: false, apiKey };
    const publicConfig = await settings.save(config);
    expect(publicConfig).not.toHaveProperty('apiKey'); expect(await readFile(settings.filename, 'utf8')).not.toContain(apiKey);
    const reboot = new ModelSettings(root, encrypted); await reboot.load(); expect(reboot.public().keyAvailable).toBe(false);
    await settings.save({ ...config, remember: true }); expect(await readFile(settings.filename, 'utf8')).not.toContain(apiKey);
    const remembered = new ModelSettings(root, encrypted); await remembered.load(); expect(remembered.snapshot().apiKey).toBe(apiKey);
    const snapshot = remembered.snapshot(); await remembered.save({ ...config, model: 'changed', apiKey: 'another-fake' });
    expect(snapshot.model).toBe('text'); expect(snapshot.apiKey).toBe(apiKey);
    await remembered.clear(); const cleared = new ModelSettings(root, encrypted); await cleared.load(); expect(cleared.public().keyAvailable).toBe(false);
  });
  it('加密不可用时退回会话，拒绝明文持久化', async () => {
    const settings = new ModelSettings(await directory(), { ...encrypted, isEncryptionAvailable: () => false });
    const result = await settings.save({ name: '', baseUrl: 'https://example.com', model: 'text', apiKey: 'fake-test', remember: true });
    expect(result.remember).toBe(false); expect(result.warning).toContain('未明文');
    expect(await readFile(settings.filename, 'utf8')).not.toContain('fake-test');
  });
  it('损坏设置不静默覆盖', async () => {
    const root = await directory(); await mkdir(root, { recursive: true }); await writeFile(path.join(root,'model-settings.json'), '{bad');
    const settings = new ModelSettings(root, encrypted); await settings.load();
    await expect(settings.save({ name: '', baseUrl: 'https://example.com', model: 'text', remember: false })).rejects.toThrow('损坏');
  });
  const config = { baseUrl: 'https://example.com', model: 'text', apiKey: 'fake-test-key-not-a-credential' };
  it.each([[401,'密钥'],[403,'权限'],[404,'接口'],[429,'限流'],[500,'异常']])('HTTP %s 分类且不透出服务商密钥', async (status, message) => {
    const fetcher = (async () => new Response(JSON.stringify({ error: config.apiKey }), { status })) as typeof fetch;
    await expect(chat(config, [], new AbortController().signal, fetcher)).rejects.toThrow(message as string);
    try { await chat(config, [], new AbortController().signal, fetcher); } catch(e) { expect((e as Error).message).not.toContain(config.apiKey); }
  });
  it('非流式最小请求，仅使用基本字段，不自动重试', async () => {
    let calls = 0;
    const fetcher = (async (url, options) => {
      calls++; expect(url).toBe('https://example.com/chat/completions');
      expect(JSON.parse(options!.body as string)).toEqual({ model: 'text', messages: [{ role:'user', content:'OK' }], stream: false });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    }) as typeof fetch;
    expect(await chat(config, [{ role:'user', content:'OK' }], new AbortController().signal, fetcher)).toBe('OK'); expect(calls).toBe(1);
  });
  it('取消和超时终止等待，网络错误不暴露底层信息', async () => {
    const fetcher = ((_: unknown, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    const controller = new AbortController(); const task = chat(config, [], controller.signal, fetcher); controller.abort();
    await expect(task).rejects.toThrow('取消');
    await expect(chat(config, [], new AbortController().signal, fetcher, 20)).rejects.toThrow('超时');
    await expect(chat(config, [], new AbortController().signal, (async () => { throw new TypeError(config.apiKey); }) as typeof fetch)).rejects.toThrow('网络');
  });
});
