import { useEffect, useState } from 'react';
import { Download, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';

interface Issue {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  type: 'UNCONFIRMED' | 'MISSING_MONTH' | 'AMOUNT_JUMP';
  contractId: string;
  label: string;
  detail: string;
}
interface Precheck {
  year: number;
  ok: boolean;
  counts: { high: number; medium: number; low: number };
  issues: Issue[];
}

const SEV_CLASS: Record<string, string> = {
  HIGH: 'border-red-200 bg-red-50 text-red-600',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-600',
  LOW: 'border-gray-200 bg-gray-50 text-gray-500',
};
const SEV_LABEL: Record<string, string> = { HIGH: '須處理', MEDIUM: '建議檢查', LOW: '提醒' };
const TYPE_LABEL: Record<string, string> = {
  UNCONFIRMED: '未確認收款',
  MISSING_MONTH: '缺漏月份',
  AMOUNT_JUMP: '金額異常',
};

export default function TaxReport() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear() - 1);
  const [data, setData] = useState<Precheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => { runPrecheck(); }, [year]);

  async function runPrecheck() {
    setLoading(true);
    const r = await api.get(`/tax-export/precheck?year=${year}`);
    setData(r.data);
    setLoading(false);
  }

  async function download() {
    setDownloading(true);
    try {
      const r = await api.get(`/tax-export?year=${year}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ParkMate_${year}租賃所得申報表.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="px-6 py-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">租賃所得申報</h1>
          <p className="text-xs text-gray-400 mt-0.5">申報前先檢查資料，再匯出申報參考表</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input text-xs py-1.5 px-2 w-24">
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <option key={y} value={y}>{y} 年度</option>
            ))}
          </select>
          <button onClick={download} disabled={downloading} className="btn-primary text-sm flex items-center gap-1 disabled:opacity-50">
            <Download className="w-4 h-4" />{downloading ? '匯出中...' : '匯出 Excel'}
          </button>
        </div>
      </div>

      <HowTo module="tax" />

      {/* Precheck summary */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">檢查中...</div>
      ) : data && (
        <>
          <div className={`card flex items-center gap-3 mb-4 ${data.ok ? 'border-green-200' : ''}`}>
            {data.ok ? (
              <CheckCircle2 className="w-8 h-8 text-green-400 flex-shrink-0" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-brand flex-shrink-0" />
            )}
            <div>
              <div className="font-semibold text-gray-800">
                {data.ok ? `${year} 年度資料檢查通過` : `發現 ${data.counts.high + data.counts.medium + data.counts.low} 項需留意`}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {data.ok
                  ? '可安心匯出申報參考表。'
                  : `須處理 ${data.counts.high} · 建議檢查 ${data.counts.medium} · 提醒 ${data.counts.low}`}
              </div>
            </div>
          </div>

          {data.issues.length > 0 && (
            <div className="space-y-2">
              {data.issues.map((it, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${SEV_CLASS[it.severity]}`}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-white/60">{SEV_LABEL[it.severity]}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/60">{TYPE_LABEL[it.type]}</span>
                      <span className="text-sm font-medium text-gray-700">{it.label}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">{it.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-5 leading-relaxed">
            說明：本表提供「實際費用」與「標準扣除 43%」兩種淨所得試算，請選擇對您較有利者申報；
            「實際費用」需備有單據佐證。
          </p>
        </>
      )}
    </div>
  );
}
