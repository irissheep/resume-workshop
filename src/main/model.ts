import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configSchema, type ModelConfig, type PublicConfig } from '../shared/schema';
import { atomicWrite } from './storage';
export interface Encryption { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
export function completionUrl(base: string): string {
  let u: URL;
  try { u = new URL(base.trim()); } catch { throw new Error('模型服务地址无效，请填写完整前缀地址'); }
  const loopback = u.hostname === 'localhost' || /^127(?:\.\d{1,3}){3}$/.test(u.hostname) || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) throw new Error('远程模型服务必须使用 HTTPS；本机回环地址可使用 HTTP');
  if (u.username || u.password || u.search || u.hash) throw new Error('服务地址不能包含账号、查询参数或片段');
  return u.toString().replace(/\/+$/, '') + '/chat/completions';
}
export class ModelSettings {
  private config: Omit<ModelConfig, 'apiKey'> = { name: '', baseUrl: 'https://api.deepseek.com', model: '', remember: false };
  private key = '';
  private warning = '';
  private corrupt = false;
  private tail = Promise.resolve();
  readonly filename: string;
  constructor(root: string, private encryption: Encryption) { this.filename = path.join(root, 'model-settings.json'); }
  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filename, 'utf8'));
      const c = configSchema.omit({ apiKey: true }).parse(parsed);
      this.config = c;
      if (parsed.encryptedKey && c.remember) {
        if (!this.encryption.isEncryptionAvailable()) this.warning = '系统加密不可用，请使用会话密钥';
        else {
          try { this.key = this.encryption.decryptString(Buffer.from(parsed.encryptedKey, 'base64')); }
          catch { this.warning = '无法解密已保存密钥，请重新输入'; }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.corrupt = true; this.warning = '模型设置文件损坏，原文件已保留。请先复制并移走 model-settings.json 后重启再配置'; }
    }
  }
  public(): PublicConfig { return { ...this.config, keyAvailable: !!this.key, encryptionAvailable: this.encryption.isEncryptionAvailable(), ...(this.warning ? { warning: this.warning } : {}) }; }
  snapshot(): { baseUrl: string; model: string; apiKey: string } {
    if (!this.key || !this.config.model.trim()) throw new Error('请先配置模型服务、模型名称和 API Key');
    completionUrl(this.config.baseUrl); return { ...this.config, apiKey: this.key };
  }
  save(input: unknown): Promise<PublicConfig> {
    const c = configSchema.parse(input); completionUrl(c.baseUrl);
    const operation = this.tail.then(async () => {
      if (this.corrupt) throw new Error(this.warning);
      const key = c.apiKey === undefined || c.apiKey === '' ? this.key : c.apiKey.trim();
      const canRemember = c.remember && this.encryption.isEncryptionAvailable();
      const next = { name: c.name, baseUrl: c.baseUrl.trim().replace(/\/+$/, ''), model: c.model.trim(), remember: canRemember };
      const encryptedKey = canRemember && key ? this.encryption.encryptString(key).toString('base64') : undefined;
      await atomicWrite(this.filename, JSON.stringify({ ...next, ...(encryptedKey ? { encryptedKey } : {}) }, null, 2));
      this.config = next; this.key = key;
      this.warning = c.remember && !canRemember ? '系统加密不可用，密钥仅在本次会话使用，未明文保存' : '';
      return this.public();
    });
    this.tail = operation.then(() => undefined, () => undefined); return operation;
  }
  clear(): Promise<PublicConfig> {
    const operation = this.tail.then(async () => {
      if (this.corrupt) throw new Error(this.warning);
      await atomicWrite(this.filename, JSON.stringify({ ...this.config, remember: false }, null, 2));
      this.key = ''; this.config.remember = false; this.warning = ''; return this.public();
    });
    this.tail = operation.then(() => undefined, () => undefined); return operation;
  }
}
export async function chat(
  config: { baseUrl: string; model: string; apiKey: string },
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = 60000
): Promise<string> {
  const timed = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetcher(completionUrl(config.baseUrl), {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, timed]),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiKey },
      body: JSON.stringify({ model: config.model, messages, stream: false })
    });
    if (!response.ok) {
      const errors: Record<number, string> = { 401: '密钥无效，请检查 API Key', 403: '没有访问权限，请检查密钥或模型权限', 404: '接口不存在，请检查服务地址、路径或模型名称', 429: '服务限流或额度不足，请查看服务商控制台' };
      throw new Error(errors[response.status] || (response.status >= 500 ? '模型服务暂时异常，请稍后主动重试' : '模型服务请求失败，状态码 ' + response.status));
    }
    if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('模型响应过大');
    const reader = response.body?.getReader(); if (!reader) throw new Error('模型服务返回空响应');
    let size = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 2_000_000) { await reader.cancel(); throw new Error('模型响应过大'); }
      chunks.push(value);
    }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('模型服务返回了无效 JSON'); }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('模型服务没有返回文本内容，请检查模型是否支持聊天接口');
    return content;
  } catch (error) {
    if (signal.aborted) throw new Error('请求已取消');
    if (timed.aborted) throw new Error('请求超时（60 秒），草稿未改变，请主动重试');
    if (error instanceof TypeError) throw new Error('网络连接失败，请检查网络、代理和模型服务地址');
    throw error;
  }
}
