import { useEffect, useState } from 'react';
import { Field } from './Editor';
import type { PublicConfig, ModelConfig } from '../shared/schema';
export function Settings({ config, onConfig, notify }: { config: PublicConfig; onConfig: (config: PublicConfig) => void; notify: (message: string, bad?: boolean) => void }) {
  const [form, setForm] = useState<ModelConfig>({ name: config.name, baseUrl: config.baseUrl, model: config.model, remember: config.remember, apiKey: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tested, setTested] = useState('');
  useEffect(() => { setForm({ name: config.name, baseUrl: config.baseUrl, model: config.model, remember: config.remember, apiKey: '' }); }, [config]);
  const update = (key: keyof ModelConfig, value: string | boolean) => { setForm(f => ({ ...f, [key]: value })); setTested(''); setError(''); };
  async function save(test: boolean) {
    setBusy(true); setError(''); setTested('');
    try {
      const result = await window.desktop.saveConfig({ ...form, apiKey: form.apiKey || undefined });
      onConfig(result);
      if (test) setTested(await window.desktop.testConnection()); else notify(result.warning || '模型配置已保存');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="settings-page"><div className="section-intro"><span className="eyebrow">YOUR MODEL, YOUR CHOICE</span><h1>连接你的模型</h1><p>请求从你的电脑直接发送到所配置的服务，费用由服务商计收。</p></div>
    <section className="settings-card"><div className="card-heading"><strong>当前模型配置</strong><span className={'tag ' + (config.keyAvailable ? 'green' : '')}>{config.keyAvailable ? '密钥已配置' : '尚未配置密钥'}</span></div>
    <div className="fields"><Field label="配置名称（选填）" value={form.name} onChange={v => update('name', v)} placeholder="例如：我的模型"/>
    <Field label="模型名称" value={form.model} onChange={v => update('model', v)} placeholder="填写服务商提供的模型 ID"/>
    <div className="full"><Field label="模型服务地址" value={form.baseUrl} onChange={v => update('baseUrl', v)} placeholder="https://api.deepseek.com" hint="填写聊天接口前缀；应用会拼接 /chat/completions，不会自动添加 /v1。"/></div>
    <div className="full key-field"><Field label="API Key" value={form.apiKey || ''} type={visible ? 'text' : 'password'} onChange={v => update('apiKey', v)} placeholder={config.keyAvailable ? '已有密钥，留空继续使用；输入可替换' : '输入你的密钥'}/><button onClick={() => setVisible(v => !v)}>{visible ? '隐藏输入' : '查看输入'}</button></div>
    <label className="check full"><input type="checkbox" checked={form.remember} onChange={event => update('remember', event.target.checked)} disabled={!config.encryptionAvailable}/>使用系统加密记住密钥</label>
    {!config.encryptionAvailable && <p className="notice full">当前系统加密不可用，密钥仅在本次会话使用。</p>}
    {config.warning && <p className="notice full">{config.warning}</p>}
    </div><div className="settings-actions"><button className="primary" disabled={busy || !form.model.trim()} onClick={() => save(false)}>{busy ? '处理中…' : '保存配置'}</button><button disabled={busy || !form.model.trim() || (!form.apiKey && !config.keyAvailable)} onClick={() => save(true)}>保存并测试连接</button><button className="text-button danger" disabled={busy || !config.keyAvailable} onClick={async () => { try { onConfig(await window.desktop.clearKey()); setForm(f => ({ ...f, apiKey: '' })); setTested(''); notify('密钥已清除'); } catch (e) { notify((e as Error).message, true); } }}>清除密钥</button></div>
    <p className="muted">连接测试只发送一条测试消息，不发送简历资料，可能消耗少量模型额度。</p>
    {error && <p className="error-box" role="alert">{error}</p>}{tested && <p className="success-box" role="status">{tested}</p>}</section>
    <section className="help-card"><h3>配置提示</h3><p>DeepSeek 的官方聊天接口前缀为 https://api.deepseek.com。模型 ID 请从当前服务商控制台或文档确认。其他兼容服务请填写其完整前缀地址。</p><p>远程地址使用 HTTPS；本机 localhost、127.0.0.1 或 ::1 可使用 HTTP。应用不查询模型列表，不自动发起请求。</p><p>密钥与简历分别保存，JSON 备份不包含密钥。已保存的密钥不会返回到编辑界面。</p></section>
  </div>;
}
