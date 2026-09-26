import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileText, AlertCircle } from 'lucide-react';
import api from '../api/client';

interface ContractData {
  id: string;
  signedAt?: string;
  signerName?: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  rentDueDay: number;
  notes?: string;
  unit: { unitNumber: string };
  property: { name: string; address: string };
  tenant: { name: string };
}

export default function SignContract() {
  const { token } = useParams<{ token: string }>();
  const [contract, setContract] = useState<ContractData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const [document, setDocument] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/contracts/sign/${token}`)
      .then((r) => {
        setContract(r.data);
        setSignerName(r.data.tenant.name);
        if (r.data.signedAt) setDone(true);
      })
      .catch(() => setError('此簽署連結無效或已過期'))
      .finally(() => setLoading(false));
    // 租約書全文；業者若還沒編過就是系統預設範本，取不到才退回下方摘要。
    api.get(`/contracts/sign/${token}/document`)
      .then((r) => setDocument(r.data.rendered))
      .catch(() => {});
  }, [token]);

  async function handleSign() {
    if (!signerName.trim() || !agreed) return;
    setSigning(true);
    try {
      await api.post(`/contracts/sign/${token}`, { signerName: signerName.trim(), agreed: true });
      setDone(true);
    } catch (e: any) {
      setError(e.response?.data?.error ?? '簽署失敗，請稍後再試');
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <div className="text-gray-400 text-sm">載入中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border border-gray-100">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="font-bold text-gray-800 text-lg mb-2">連結無效</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border border-gray-100">
          <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h2 className="font-bold text-gray-800 text-xl mb-2">簽署完成</h2>
          <p className="text-gray-500 text-sm mb-4">
            {contract?.signerName ?? signerName} 已完成電子簽署
          </p>
          {contract?.signedAt && (
            <p className="text-xs text-gray-400">
              簽署時間：{new Date(contract.signedAt).toLocaleString('zh-TW')}
            </p>
          )}
          <div className="mt-4 bg-warm rounded-xl p-3 text-left text-xs text-gray-500 space-y-1">
            <div>{contract?.property.name} · {contract?.unit.unitNumber}</div>
            <div>{contract?.property.address}</div>
          </div>

          {/* 簽完之後仍要看得到自己簽的是什麼 */}
          {document && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-xs text-brand font-medium flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />檢視已簽署的租約書全文
              </summary>
              <div className="mt-2 max-h-80 overflow-y-auto bg-gray-50 rounded-xl p-3 text-xs text-gray-600 leading-loose whitespace-pre-wrap">
                {document}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand rounded-xl flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">電子租約簽署</h1>
          <p className="text-sm text-gray-400 mt-1">ParkMate 停車位月租平台</p>
        </div>

        {/* Contract summary */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-brand/10 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-brand" />
            </div>
            <div>
              <div className="font-semibold text-gray-800 text-sm">{contract!.property.name}</div>
              <div className="text-xs text-gray-400">{contract!.property.address}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-warm rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">車位號碼</div>
              <div className="font-semibold text-gray-700">{contract!.unit.unitNumber}</div>
            </div>
            <div className="bg-warm rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">月租金</div>
              <div className="font-semibold text-brand">NT${Number(contract!.monthlyRent).toLocaleString()}</div>
            </div>
            <div className="bg-warm rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">租約開始</div>
              <div className="font-semibold text-gray-700">{new Date(contract!.startDate).toLocaleDateString('zh-TW')}</div>
            </div>
            <div className="bg-warm rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">租約結束</div>
              <div className="font-semibold text-gray-700">{new Date(contract!.endDate).toLocaleDateString('zh-TW')}</div>
            </div>
            <div className="bg-warm rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">押金</div>
              <div className="font-semibold text-gray-700">NT${Number(contract!.depositAmount).toLocaleString()}</div>
            </div>
            <div className="bg-warm rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">每月繳租日</div>
              <div className="font-semibold text-gray-700">每月 {contract!.rentDueDay} 日</div>
            </div>
          </div>

          {contract!.notes && (
            <div className="mt-3 bg-warm rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-1">備注</div>
              <div className="text-sm text-gray-600 whitespace-pre-line">{contract!.notes}</div>
            </div>
          )}
        </div>

        {/* 租約書全文 */}
        {document && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <h3 className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-brand" />租約書全文
            </h3>
            <div className="max-h-96 overflow-y-auto bg-gray-50 rounded-xl p-4 text-xs text-gray-600 leading-loose whitespace-pre-wrap">
              {document}
            </div>
            <p className="text-xs text-gray-400 mt-2">請向下捲動詳閱全部條款後再簽署。</p>
          </div>
        )}

        {/* Terms */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">
            {document ? '重點提醒' : '租賃條款摘要'}
          </h3>
          <ul className="text-xs text-gray-500 space-y-2 list-none">
            <li className="flex gap-2"><span className="text-brand font-bold">1.</span>車主同意按月繳納租金，每月 {contract!.rentDueDay} 日前完成繳款。</li>
            <li className="flex gap-2"><span className="text-brand font-bold">2.</span>押金 NT${Number(contract!.depositAmount).toLocaleString()} 於合約結束時退還（扣除損壞費用）。</li>
            <li className="flex gap-2"><span className="text-brand font-bold">3.</span>車主應妥善保管房屋，不得擅自改裝或轉租。</li>
            <li className="flex gap-2"><span className="text-brand font-bold">4.</span>提前終止合約需提前一個月書面通知業者。</li>
            <li className="flex gap-2"><span className="text-brand font-bold">5.</span>本電子簽署具有與書面簽名同等之法律效力。</li>
          </ul>
        </div>

        {/* Signature form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">電子簽署確認</h3>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1.5">簽署人姓名（請與身份證相符）</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand"
              placeholder="請輸入您的全名"
            />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-brand"
            />
            <span className="text-xs text-gray-500 leading-relaxed">
              我已詳細閱讀並理解以上租賃條款，確認以電子方式簽署本租賃合約，並同意本電子簽名具有完整法律效力。
            </span>
          </label>
        </div>

        <button
          onClick={handleSign}
          disabled={!signerName.trim() || !agreed || signing}
          className="w-full py-3.5 bg-brand text-white font-semibold rounded-2xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-dark transition-colors"
        >
          {signing ? '簽署中...' : '確認簽署合約'}
        </button>

        <p className="text-center text-xs text-gray-300 mt-4">
          本頁面由 ParkMate 提供 · 僅供本次合約簽署使用
        </p>
      </div>
    </div>
  );
}
