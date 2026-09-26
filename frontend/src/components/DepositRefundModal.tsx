import { useEffect, useState } from 'react';
import {
  X, Plus, Trash2, Send, CheckCircle2, RefreshCw, AlertTriangle, Banknote,
} from 'lucide-react';
import api from '../api/client';
import { Contract, DepositRefund, DepositDeduction } from '../types';

type DeductionDraft = Omit<DepositDeduction, 'id'> & { id?: string };

const CATEGORY_LABELS: Record<string, string> = {
  REPAIR: '維修損壞',
  CLEANING: '清潔費用',
  UTILITY: '水電欠款',
  OTHER: '其他',
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING:    { label: '待確認', cls: 'bg-yellow-100 text-yellow-700' },
  PROCESSING: { label: '核算中', cls: 'bg-blue-100 text-blue-700' },
  COMPLETED:  { label: '已退款', cls: 'bg-green-100 text-green-700' },
};

interface Props {
  contract: Contract;
  onClose: () => void;
  onSaved: () => void;
}

export default function DepositRefundModal({ contract, onClose, onSaved }: Props) {
  const depositAmount = Number(contract.depositAmount);

  const [refund, setRefund] = useState<DepositRefund | null>(null);
  const [deductions, setDeductions] = useState<DeductionDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    api.get(`/contracts/${contract.id}/deposit-refund`)
      .then((r) => {
        if (r.data) {
          setRefund(r.data);
          setDeductions(r.data.deductions.map((d: DepositDeduction) => ({ ...d })));
          setNotes(r.data.notes ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contract.id]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function addDeduction() {
    setDeductions((prev) => [...prev, { description: '', amount: 0, category: 'OTHER' }]);
  }

  function removeDeduction(idx: number) {
    setDeductions((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateDeduction(idx: number, field: keyof DeductionDraft, value: string | number) {
    setDeductions((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  }

  const totalDeductions = deductions.reduce((s, d) => s + Number(d.amount || 0), 0);
  const refundAmount = Math.max(0, depositAmount - totalDeductions);

  async function handleSave() {
    const invalid = deductions.find((d) => !d.description.trim() || Number(d.amount) <= 0);
    if (invalid) { showToast('請填寫完整的扣款項目', false); return; }
    setSaving(true);
    try {
      const r = await api.post(`/contracts/${contract.id}/deposit-refund`, {
        deductions: deductions.map((d) => ({
          description: d.description.trim(),
          amount: Number(d.amount),
          category: d.category,
        })),
        notes,
      });
      setRefund(r.data);
      showToast('退押紀錄已儲存');
      onSaved();
    } catch { showToast('儲存失敗，請稍後再試', false); }
    setSaving(false);
  }

  async function handleConfirm() {
    if (!confirm(`確認已退款 NT$${refundAmount.toLocaleString()} 給 ${contract.tenant?.name}？`)) return;
    setConfirming(true);
    try {
      const r = await api.put(`/contracts/${contract.id}/deposit-refund/confirm`);
      setRefund(r.data);
      showToast('已標記為完成退款');
      onSaved();
    } catch { showToast('操作失敗', false); }
    setConfirming(false);
  }

  async function handleNotify() {
    setNotifying(true);
    try {
      const r = await api.post(`/contracts/${contract.id}/deposit-refund/notify`);
      setRefund((prev) => prev ? { ...prev, notifiedAt: new Date().toISOString() } : prev);
      showToast(r.data.message, r.data.sent);
    } catch { showToast('通知發送失敗', false); }
    setNotifying(false);
  }

  const isCompleted = refund?.status === 'COMPLETED';
  const hasRefund = !!refund;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-bold text-lg text-gray-800">押金退還</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {contract.tenant?.name} · {contract.unit?.unitNumber}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasRefund && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_MAP[refund!.status].cls}`}>
                {STATUS_MAP[refund!.status].label}
              </span>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mx-5 mt-3 text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 ${toast.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
            {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            {toast.msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
          ) : (
            <>
              {/* Deposit summary bar */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-warm rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">原始押金</div>
                  <div className="font-bold text-gray-800 text-sm">NT${depositAmount.toLocaleString()}</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">扣款合計</div>
                  <div className="font-bold text-red-500 text-sm">-NT${totalDeductions.toLocaleString()}</div>
                </div>
                <div className={`rounded-xl p-3 text-center ${refundAmount > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <div className="text-xs text-gray-400 mb-1">應退金額</div>
                  <div className={`font-bold text-sm ${refundAmount > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                    NT${refundAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Deductions list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">扣款明細</span>
                  {!isCompleted && (
                    <button
                      onClick={addDeduction}
                      className="flex items-center gap-1 text-xs text-brand border border-brand/30 rounded-lg px-2.5 py-1 hover:bg-brand/5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />新增扣款
                    </button>
                  )}
                </div>

                {deductions.length === 0 ? (
                  <div className="border border-dashed border-gray-200 rounded-xl py-6 text-center text-sm text-gray-400">
                    無扣款項目，押金全額退還
                    {!isCompleted && (
                      <div className="mt-2">
                        <button onClick={addDeduction} className="text-xs text-brand hover:underline">
                          + 新增扣款項目
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deductions.map((d, idx) => (
                      <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                        {isCompleted ? (
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-gray-700">{d.description}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{CATEGORY_LABELS[d.category]}</div>
                            </div>
                            <div className="text-sm font-semibold text-red-500">-NT${Number(d.amount).toLocaleString()}</div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="扣款原因（如：牆面油漆修復）"
                                value={d.description}
                                onChange={(e) => updateDeduction(idx, 'description', e.target.value)}
                                className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand bg-white"
                              />
                              <button
                                onClick={() => removeDeduction(idx)}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <select
                                value={d.category}
                                onChange={(e) => updateDeduction(idx, 'category', e.target.value)}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand bg-white"
                              >
                                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                              <div className="flex items-center gap-1 flex-1">
                                <span className="text-xs text-gray-400">NT$</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={d.amount || ''}
                                  onChange={(e) => updateDeduction(idx, 'amount', e.target.value)}
                                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">備註說明</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isCompleted}
                  rows={2}
                  placeholder="如：現場點交完成，無其他爭議..."
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-brand resize-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              {/* Completed info */}
              {isCompleted && refund?.refundDate && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <div className="text-sm text-green-700">
                    已於 {new Date(refund.refundDate).toLocaleDateString('zh-TW')} 完成退款
                    {refund.notifiedAt && (
                      <span className="text-xs text-green-500 ml-2">
                        · 已通知車主 {new Date(refund.notifiedAt).toLocaleDateString('zh-TW')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {!loading && (
          <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 space-y-2">
            {!isCompleted && (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 btn-primary text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  {saving ? '儲存中...' : '儲存明細'}
                </button>
                {hasRefund && (
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white rounded-xl text-sm font-medium py-2.5 hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {confirming ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                    確認已退款
                  </button>
                )}
              </div>
            )}
            {hasRefund && (
              <button
                onClick={handleNotify}
                disabled={notifying}
                className="w-full flex items-center justify-center gap-2 border border-brand/30 text-brand rounded-xl text-sm font-medium py-2.5 hover:bg-brand/5 transition-colors disabled:opacity-50"
              >
                {notifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {notifying ? '發送中...' : `LINE 通知車主明細${refund?.notifiedAt ? '（重發）' : ''}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
