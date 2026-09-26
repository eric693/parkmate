import { useEffect, useState } from 'react';
import { X, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import { Contract } from '../types';

interface Issue {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  type: 'MISSING' | 'PROHIBITED' | 'SUGGESTION';
  item: string;
  detail: string;
}
interface Result {
  score: number;
  passed: boolean;
  issues: Issue[];
  summary: string;
  aiChecked: boolean;
}

const SEV_CLASS: Record<string, string> = {
  HIGH: 'border-red-200 bg-red-50',
  MEDIUM: 'border-amber-200 bg-amber-50',
  LOW: 'border-gray-200 bg-gray-50',
};
const TYPE_LABEL: Record<string, string> = { MISSING: '應記載缺漏', PROHIBITED: '不得記載', SUGGESTION: '建議' };

export default function ComplianceModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.post(`/contracts/${contract.id}/compliance-check`).then((r) => {
      setResult(r.data);
      setLoading(false);
    });
  }, [contract.id]);

  const scoreColor = (s: number) => (s >= 80 ? 'text-green-500' : s >= 60 ? 'text-amber-500' : 'text-red-500');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brand" />合約合規檢查</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{contract.unit?.property?.name} {contract.unit?.unitNumber} · {contract.tenant?.name}</p>

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">檢查中，依內政部應記載及不得記載事項分析...</div>
        ) : result && (
          <>
            <div className="flex items-center gap-4 bg-warm rounded-2xl p-4 mb-4">
              <div className={`text-4xl font-bold ${scoreColor(result.score)}`}>{result.score}</div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  {result.passed ? (
                    <><CheckCircle2 className="w-4 h-4 text-green-500" />無重大違規</>
                  ) : (
                    <><AlertTriangle className="w-4 h-4 text-red-500" />有須處理的問題</>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{result.summary}</div>
                {!result.aiChecked && <div className="text-xs text-gray-400 mt-0.5">（AI 未啟用，僅規則檢查）</div>}
              </div>
            </div>

            {result.issues.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-4">未發現問題項目。</div>
            ) : (
              <div className="space-y-2">
                {result.issues.map((it, i) => (
                  <div key={i} className={`rounded-xl border px-3 py-2.5 ${SEV_CLASS[it.severity]}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs font-semibold text-gray-700">{it.item}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/70 text-gray-500">{TYPE_LABEL[it.type]}</span>
                    </div>
                    <div className="text-xs text-gray-600">{it.detail}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4">本檢查為輔助參考，最終仍請依主管機關公告之契約範本核對。</p>
          </>
        )}
      </div>
    </div>
  );
}
