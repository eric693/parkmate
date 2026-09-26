import { useEffect, useState } from 'react';
import {
  X, FileText, Eye, Pencil, Send, RotateCcw, Save, RefreshCw, Printer, Lock, BookmarkPlus, Trash2,
} from 'lucide-react';
import api from '../api/client';

interface Props {
  contract: any;
  onClose: () => void;
  onSent?: (msg: string) => void;
}

interface Variable { key: string; label: string; value: string }

/** 租約書內容編輯、預覽與傳送。內容用 {{變數}} 佔位，預覽時才代入實際值。 */
export default function ContractDocumentModal({ contract, onClose, onSent }: Props) {
  const [tab, setTab] = useState<'edit' | 'preview'>('preview');
  const [body, setBody] = useState('');
  const [rendered, setRendered] = useState('');
  const [variables, setVariables] = useState<Variable[]>([]);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [signerName, setSignerName] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  const locked = Boolean(signedAt);

  function apply(data: any) {
    setBody(data.body);
    setRendered(data.rendered);
    setVariables(data.variables);
    setSignedAt(data.signedAt);
    setSignerName(data.signerName);
    setSentAt(data.sentAt);
    setDirty(false);
  }

  useEffect(() => {
    api.get(`/contracts/${contract.id}/document`)
      .then((r) => apply(r.data))
      .catch(() => setMsg({ text: '載入失敗', err: true }))
      .finally(() => setLoading(false));
    api.get('/contract-templates').then((r) => setTemplates(r.data.templates)).catch(() => {});
  }, [contract.id]);

  // Esc 關閉；編輯中且有未存的修改先確認，避免誤觸丟失內容
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (dirty && !confirm('有未儲存的修改，確定要關閉嗎？')) return;
      onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, onClose]);

  function flash(text: string, err = false) {
    setMsg({ text, err });
    setTimeout(() => setMsg(null), 3500);
  }

  /** 切到預覽時，若有未存的修改就先向後端要一份代入後的結果。 */
  async function goPreview() {
    setTab('preview');
    if (!dirty) return;
    try {
      const { data } = await api.post(`/contracts/${contract.id}/document/preview`, { body });
      setRendered(data.rendered);
    } catch { /* 預覽失敗就沿用上次結果 */ }
  }

  async function save() {
    setBusy('save');
    try {
      const { data } = await api.put(`/contracts/${contract.id}/document`, { body });
      apply(data);
      flash('租約書已儲存');
    } catch (e: any) {
      flash(e?.response?.data?.error ?? '儲存失敗', true);
    }
    setBusy(null);
  }

  async function reset() {
    if (!confirm('確定要還原成系統預設範本？目前的修改會遺失。')) return;
    setBusy('reset');
    try {
      const { data } = await api.post(`/contracts/${contract.id}/document/reset`);
      apply(data);
      flash('已還原為預設範本');
    } catch (e: any) {
      flash(e?.response?.data?.error ?? '還原失敗', true);
    }
    setBusy(null);
  }

  async function send() {
    if (dirty && !confirm('有未儲存的修改，傳送的會是已儲存的版本。要繼續嗎？')) return;
    setBusy('send');
    try {
      const { data } = await api.post(`/contracts/${contract.id}/document/send`);
      setSentAt(new Date().toISOString());
      flash(data.message);
      onSent?.(data.message);
    } catch (e: any) {
      flash(e?.response?.data?.error ?? '傳送失敗', true);
    }
    setBusy(null);
  }

  async function saveAsTemplate() {
    const name = prompt('範本名稱：');
    if (!name) return;
    try {
      const { data } = await api.post('/contract-templates', { name, body });
      setTemplates((t) => [data, ...t]);
      flash(`已存成範本「${name}」`);
    } catch { flash('存成範本失敗', true); }
  }

  /** 範本改名，並可選擇用目前編輯中的內容覆蓋範本內容 */
  async function editTemplate(t: { id: string; name: string; body: string }) {
    const name = prompt('範本名稱：', t.name);
    if (name === null) return;
    const overwrite = confirm('要用目前編輯中的租約內容覆蓋這個範本嗎？\n按「取消」只改名稱。');
    try {
      const { data } = await api.put(`/contract-templates/${t.id}`, { name: name || t.name, body: overwrite ? body : undefined });
      setTemplates((list) => list.map((x) => (x.id === t.id ? { ...x, ...data } : x)));
      flash('範本已更新');
    } catch { flash('更新範本失敗', true); }
  }

  async function removeTemplate(id: string) {
    if (!confirm('確定刪除此範本？')) return;
    try {
      await api.delete(`/contract-templates/${id}`);
      setTemplates((t) => t.filter((x) => x.id !== id));
    } catch { flash('刪除失敗', true); }
  }

  /** 在游標處插入變數佔位符。 */
  function insertVariable(key: string) {
    const el = document.getElementById('doc-body') as HTMLTextAreaElement | null;
    const token = `{{${key}}}`;
    if (!el) { setBody((b) => b + token); setDirty(true); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    setDirty(true);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  }

  function print() {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const esc = rendered.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    w.document.write(
      `<html><head><title>租約書</title><style>
        body{font-family:"Noto Sans TC","PingFang TC",sans-serif;line-height:2;padding:48px;white-space:pre-wrap;font-size:14px;color:#222}
      </style></head><body>${esc}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand" />租約書
            </h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {contract.unit?.property?.name} {contract.unit?.unitNumber} · {contract.tenant?.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {locked && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">
              {signerName} 已於 {new Date(signedAt!).toLocaleString('zh-TW')} 完成簽署，內容不可再修改。
            </span>
          </div>
        )}

        {msg && (
          <div className={`mx-5 mt-3 rounded-xl px-3 py-2 text-xs ${msg.err ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mx-5 mt-3 bg-gray-50 rounded-xl p-1">
          <button
            onClick={goPreview}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'preview' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
          >
            <Eye className="w-4 h-4" />預覽完稿
          </button>
          <button
            onClick={() => setTab('edit')}
            disabled={locked}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${tab === 'edit' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
          >
            <Pencil className="w-4 h-4" />編輯內容
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">載入中...</div>
          ) : tab === 'preview' ? (
            <div className="bg-warm border border-gray-100 rounded-xl p-5 text-sm text-gray-700 leading-loose whitespace-pre-wrap font-serif">
              {rendered}
            </div>
          ) : (
            <>
              <div className="mb-3">
                <div className="text-xs text-gray-400 mb-1.5">點一下插入變數，預覽時會自動代入實際值：</div>
                <div className="flex flex-wrap gap-1">
                  {variables.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      title={v.value}
                      className="px-2 py-0.5 bg-brand/10 text-brand rounded-lg text-xs hover:bg-brand/20 transition-colors"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                id="doc-body"
                value={body}
                onChange={(e) => { setBody(e.target.value); setDirty(true); }}
                className="w-full h-[45vh] border border-gray-200 rounded-xl p-3 text-sm leading-relaxed font-mono focus:outline-none focus:border-brand resize-none"
                spellCheck={false}
              />

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button onClick={saveAsTemplate} className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700">
                  <BookmarkPlus className="w-3.5 h-3.5" />存成範本
                </button>
                {templates.length > 0 && (
                  <button onClick={() => setShowTemplates((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700">
                    套用範本（{templates.length}）
                  </button>
                )}
                <button onClick={reset} disabled={busy === 'reset'} className="text-xs text-gray-400 flex items-center gap-1 hover:text-gray-600 ml-auto">
                  <RotateCcw className="w-3.5 h-3.5" />還原預設範本
                </button>
              </div>

              {showTemplates && (
                <div className="mt-2 border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {templates.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-3 py-2">
                      <button
                        onClick={() => { setBody(t.body); setDirty(true); setShowTemplates(false); }}
                        className="flex-1 text-left text-sm text-gray-700 hover:text-brand"
                      >
                        {t.name}
                      </button>
                      <button onClick={() => editTemplate(t)} className="text-gray-300 hover:text-gray-600" aria-label="編輯範本">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeTemplate(t.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 flex-wrap">
          {sentAt && (
            <span className="text-xs text-gray-400 mr-auto">
              上次傳送：{new Date(sentAt).toLocaleString('zh-TW')}
            </span>
          )}
          <button onClick={print} className="btn-secondary text-sm flex items-center gap-1.5 ml-auto">
            <Printer className="w-4 h-4" />列印
          </button>
          {!locked && (
            <button
              onClick={save}
              disabled={!dirty || busy === 'save'}
              className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-40"
            >
              {busy === 'save' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              儲存
            </button>
          )}
          <button
            onClick={send}
            disabled={busy === 'send'}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === 'send' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {locked ? '重寄給車主' : '傳送給車主簽署'}
          </button>
        </div>
      </div>
    </div>
  );
}
