import { useEffect, useState } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import api from '../api/client';
import SearchBox from '../components/SearchBox';
import AttachmentModal, { AttachmentThumb } from '../components/AttachmentModal';
import {
  Attachment, AttachmentEntity, ALL_CATEGORIES, ENTITY_LABEL, openAttachment, downloadAttachment, formatSize,
} from '../lib/attachments';

/** 檔案庫：跨車位／車主／合約搜尋所有照片與檔案（例如找出所有違停佐證、今年的發票） */
export default function Files() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [entityType, setEntityType] = useState<AttachmentEntity | ''>('');
  const [opened, setOpened] = useState<Attachment | null>(null);

  function load() {
    setLoading(true);
    api.get<Attachment[]>('/attachments', { params: { q: q || undefined, category: category || undefined, entityType: entityType || undefined, limit: 300 } })
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q, category, entityType]);

  return (
    <div className="px-6 py-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">檔案庫</h1>
        <p className="text-xs text-gray-400 mt-0.5">所有照片與檔案集中查找：車損、違停佐證、行照證件、合約掃描、繳費憑證、發票收據</p>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="搜尋檔名或備註" className="max-w-xs" />
        <select className="input max-w-[10rem]" value={entityType} onChange={(e) => setEntityType(e.target.value as AttachmentEntity | '')} aria-label="所屬">
          <option value="">全部對象</option>
          {(Object.keys(ENTITY_LABEL) as AttachmentEntity[]).map((k) => <option key={k} value={k}>{ENTITY_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {['', ...ALL_CATEGORIES].map((c) => (
          <button
            key={c || 'all'}
            onClick={() => setCategory(c)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${category === c ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:border-brand'}`}
          >{c || '全部分類'}</button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="text-center text-gray-400 py-16 text-sm">載入中...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 text-center py-16 text-gray-400 text-sm">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          {q || category || entityType ? '沒有符合條件的檔案' : '還沒有上傳任何檔案。到車位、車主、車牌查詢、合約、報修、支出或租金紀錄點「附件」即可上傳。'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {items.map((a) => (
            <div key={a.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <button type="button" className="block w-full" onClick={() => openAttachment(a)} title={a.fileName}>
                <AttachmentThumb a={a} className="w-full h-32" />
              </button>
              <div className="p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-brand">{a.category}</span>
                  <button onClick={() => downloadAttachment(a)} className="text-gray-400 hover:text-brand" aria-label="下載"><Download className="w-3.5 h-3.5" /></button>
                </div>
                <button
                  onClick={() => setOpened(a)}
                  className="block w-full text-left text-xs text-gray-700 hover:text-brand truncate"
                  title="開啟這筆資料的所有附件"
                >{a.entityLabel ?? `${ENTITY_LABEL[a.entityType]}（已刪除）`}</button>
                {a.note && <div className="text-xs text-gray-500 line-clamp-2">{a.note}</div>}
                <div className="text-[11px] text-gray-400 truncate">
                  {new Date(a.createdAt).toLocaleDateString('zh-TW')}・{a.uploadedBy}・{formatSize(a.size)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {opened && (
        <AttachmentModal
          entityType={opened.entityType}
          entityId={opened.entityId}
          title={opened.entityLabel ?? ENTITY_LABEL[opened.entityType]}
          onClose={() => setOpened(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
