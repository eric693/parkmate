import { useEffect, useRef, useState } from 'react';
import { X, Camera, Upload, FileText, Download, Trash2, Paperclip, ShieldAlert, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import api from '../api/client';
import {
  Attachment, AttachmentEntity, ALL_CATEGORIES, SUGGESTED, SENSITIVE, ACCEPT,
  uploadFile, fileUrl, openAttachment, downloadAttachment, formatSize,
} from '../lib/attachments';

/** 圖片縮圖：附件需驗證才能讀，所以用 blob URL */
export function AttachmentThumb({ a, className = '' }: { a: Attachment; className?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (!a.isImage) return;
    let alive = true;
    fileUrl(a.id).then((u) => { if (alive) setSrc(u); }).catch(() => {});
    return () => { alive = false; };
  }, [a.id, a.isImage]);
  if (!a.isImage) {
    const ext = a.fileName.split('.').pop()?.toUpperCase().slice(0, 4) ?? '';
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-50 text-gray-400 ${className}`}>
        <FileText className="w-7 h-7" />
        <span className="text-[10px] font-semibold mt-0.5">{ext}</span>
      </div>
    );
  }
  return src
    ? <img src={src} alt={a.fileName} className={`object-cover ${className}`} />
    : <div className={`bg-gray-100 animate-pulse ${className}`} />;
}

function Lightbox({ items, index, onIndex, onClose }: {
  items: Attachment[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const a = items[index];
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    setSrc(undefined);
    fileUrl(a.id).then(setSrc).catch(() => {});
  }, [a.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onIndex]);

  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <div className="font-medium truncate">{a.category}・{a.fileName}</div>
          <div className="text-xs text-white/60">上傳 {new Date(a.createdAt).toLocaleString('zh-TW')}・{a.uploadedBy}{a.note ? `・${a.note}` : ''}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => downloadAttachment(a)} className="p-2 hover:bg-white/10 rounded-lg" aria-label="下載"><Download className="w-5 h-5" /></button>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg" aria-label="關閉"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center relative min-h-0 px-2 pb-4">
        {src ? <img src={src} alt={a.fileName} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          : <Loader2 className="w-8 h-8 text-white/60 animate-spin" />}
        {index > 0 && (
          <button onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} className="absolute left-2 p-2 bg-black/40 rounded-full text-white" aria-label="上一張">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {index < items.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} className="absolute right-2 p-2 bg-black/40 rounded-full text-white" aria-label="下一張">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}

/** 某一筆資料（車位／車主／車輛／合約…）的照片與檔案 */
export default function AttachmentModal({ entityType, entityId, title, onClose, onChanged }: {
  entityType: AttachmentEntity;
  entityId: string;
  title: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const suggested = SUGGESTED[entityType];
  const categories = [...suggested, ...ALL_CATEGORIES.filter((c) => !suggested.includes(c))];
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(suggested[0]);
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [viewing, setViewing] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api.get<Attachment[]>('/attachments', { params: { entityType, entityId } })
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  }
  useEffect(load, [entityType, entityId]);

  async function upload(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setErrors([]);
    setProgress({ done: 0, total: list.length });
    const errs: string[] = [];
    for (const [i, f] of list.entries()) {
      try {
        await uploadFile(f, { entityType, entityId, category, note });
      } catch (e) {
        const msg = (e as { response?: { data?: { error?: string } }; message?: string });
        errs.push(`${f.name}：${msg.response?.data?.error ?? msg.message ?? '上傳失敗'}`);
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    setErrors(errs);
    if (errs.length < list.length) setNote('');
    load();
    onChanged?.();
  }

  async function remove(a: Attachment) {
    if (!confirm(`確定刪除「${a.fileName}」？刪除後無法復原。`)) return;
    await api.delete(`/attachments/${a.id}`);
    load();
    onChanged?.();
  }

  async function changeCategory(a: Attachment, c: string) {
    const { data } = await api.put<Attachment>(`/attachments/${a.id}`, { category: c });
    setItems((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...data } : x)));
    onChanged?.();
  }

  const shown = filter ? items.filter((a) => a.category === filter) : items;
  const images = shown.filter((a) => a.isImage);
  const present = [...new Set(items.map((a) => a.category))];
  const busy = progress !== null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 md:p-4">
      <div
        className={`bg-white w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] flex flex-col ${dragging ? 'ring-4 ring-brand/40' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) upload(e.dataTransfer.files); }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-800 flex items-center gap-1.5"><Paperclip className="w-4 h-4 text-brand" />照片與檔案</h2>
            <div className="text-xs text-gray-400 truncate">{title}</div>
          </div>
          <button onClick={onClose} aria-label="關閉"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* 上傳區 */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-3 bg-warm/40">
          <div className="flex flex-wrap gap-1.5">
            {categories.slice(0, suggested.length).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${category === c ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:border-brand'}`}
              >{c}</button>
            ))}
            <select
              value={suggested.includes(category) ? '' : category}
              onChange={(e) => e.target.value && setCategory(e.target.value)}
              className={`text-xs px-2 py-1 rounded-full border bg-white ${suggested.includes(category) ? 'border-gray-200 text-gray-500' : 'border-brand text-brand'}`}
              aria-label="其他分類"
            >
              <option value="">其他分類…</option>
              {categories.slice(suggested.length).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input className="input" placeholder="備註（選填，例：左後保險桿舊刮痕、B2 柱子旁）" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          {SENSITIVE.includes(category) && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              證件屬個人資料：檔案不公開，只有登入且有權限的帳號看得到；租約結束後可刪除，刪除車主時也會一併清除。
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()} className="btn-primary text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Camera className="w-4 h-4" />拍照上傳
            </button>
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="btn-secondary text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Upload className="w-4 h-4" />選擇檔案
            </button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          <div className="text-xs text-gray-400">
            {busy
              ? <span className="text-brand flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />上傳中 {progress!.done}/{progress!.total}…</span>
              : '照片、PDF、Word、Excel，單檔 10MB 內，可一次選多個或直接拖曳進來。照片會自動壓縮，並記錄上傳時間與上傳人作為佐證。'}
          </div>
          {errors.length > 0 && (
            <ul className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 space-y-0.5">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {present.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button onClick={() => setFilter('')} className={`text-xs px-2 py-0.5 rounded-lg ${!filter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'}`}>全部 {items.length}</button>
              {present.map((c) => (
                <button key={c} onClick={() => setFilter(c)} className={`text-xs px-2 py-0.5 rounded-lg ${filter === c ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {c} {items.filter((a) => a.category === c).length}
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-8">載入中...</div>
          ) : shown.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">
              還沒有照片或檔案
              <div className="text-xs mt-1">建議：進場時拍車位與車況、收行照與身分證影本，退租時再拍一次，發生糾紛時有憑有據。</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {shown.map((a) => (
                <div key={a.id} className="border border-gray-100 rounded-xl overflow-hidden group">
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => (a.isImage ? setViewing(images.indexOf(a)) : openAttachment(a))}
                    title={a.fileName}
                  >
                    <AttachmentThumb a={a} className="w-full h-28" />
                  </button>
                  <div className="p-2 space-y-1">
                    <select
                      value={a.category}
                      onChange={(e) => changeCategory(a, e.target.value)}
                      className="w-full text-xs font-medium text-brand bg-transparent -ml-0.5"
                      aria-label="分類"
                    >
                      {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="text-xs text-gray-600 truncate" title={a.fileName}>{a.fileName}</div>
                    {a.note && <div className="text-xs text-gray-500 line-clamp-2">{a.note}</div>}
                    <div className="text-[11px] text-gray-400 leading-tight">
                      {new Date(a.createdAt).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}・{a.uploadedBy || '—'}
                      <br />{formatSize(a.size)}
                    </div>
                    <div className="flex gap-1 pt-1">
                      <button onClick={() => downloadAttachment(a)} className="flex-1 text-xs py-1 border border-gray-200 rounded-lg text-gray-500 hover:border-brand hover:text-brand flex items-center justify-center gap-1">
                        <Download className="w-3 h-3" />下載
                      </button>
                      {a.canDelete && (
                        <button onClick={() => remove(a)} className="px-2 py-1 border border-red-100 rounded-lg text-red-400 hover:bg-red-50" aria-label="刪除">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {viewing !== null && images[viewing] && (
        <Lightbox items={images} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/** 列表上的「附件」按鈕：顯示數量，點開管理；missing 可標示缺少的必要文件 */
export function AttachmentButton({ entityType, entityId, title, count = 0, missing, onChanged, compact }: {
  entityType: AttachmentEntity;
  entityId: string;
  title: string;
  count?: number;
  missing?: string;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 不讓點擊冒泡到外層（例如可點擊展開的卡片標題）
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={missing ? `缺${missing}` : '照片與檔案'}
        className={compact
          ? 'p-1.5 rounded-lg hover:bg-gray-100 relative inline-flex items-center text-gray-500'
          : 'text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-brand hover:text-brand transition-colors inline-flex items-center gap-1'}
        aria-label="照片與檔案"
      >
        <Paperclip className={compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        {!compact && '附件'}
        {count > 0 && (
          <span className={compact
            ? 'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] leading-4 text-center'
            : 'bg-brand/10 text-brand rounded-full px-1.5 text-[11px] font-semibold'}>{count}</span>
        )}
        {missing && !compact && <span className="text-amber-600">缺{missing}</span>}
      </button>
      {open && (
        <AttachmentModal entityType={entityType} entityId={entityId} title={title} onClose={() => setOpen(false)} onChanged={onChanged} />
      )}
    </span>
  );
}
