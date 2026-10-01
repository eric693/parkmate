import { useEffect, useState } from 'react';
import { TrendingUp, MapPin, Info } from 'lucide-react';
import api from '../api/client';
import { Property } from '../types';
import HowTo from '../components/HowTo';

interface Comp {
  district: string;
  type: string;
  sampleSize: number;
  medianRent: number;
  avgRent: number;
  minRent: number;
  maxRent: number;
  medianPerPing: number | null;
}

interface Pricing {
  district: string;
  type: string;
  yourRent: number;
  marketMedian: number;
  marketRange: [number, number];
  sampleSize: number;
  position: 'BELOW' | 'INLINE' | 'ABOVE' | 'NO_DATA';
  deltaPct: number;
  advice: string;
}

const POS_CLASS: Record<string, string> = {
  BELOW: 'bg-blue-50 text-blue-600 border-blue-200',
  INLINE: 'bg-green-50 text-green-600 border-green-200',
  ABOVE: 'bg-amber-50 text-amber-600 border-amber-200',
  NO_DATA: 'bg-gray-50 text-gray-500 border-gray-200',
};
const POS_LABEL: Record<string, string> = { BELOW: '低於行情', INLINE: '符合行情', ABOVE: '高於行情', NO_DATA: '資料不足' };

export default function RentComps() {
  const [comps, setComps] = useState<Comp[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [unitId, setUnitId] = useState('');
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/rent-comps'), api.get('/properties')]).then(([c, p]) => {
      setComps(c.data);
      setProperties(p.data);
      setLoading(false);
    });
  }, []);

  const allUnits = properties.flatMap((p) => p.units.map((u) => ({ ...u, propertyName: p.name })));

  async function checkPricing(id: string) {
    setUnitId(id);
    setPricing(null);
    if (!id) return;
    const r = await api.get(`/units/${id}/pricing`);
    setPricing(r.data);
  }

  return (
    <div className="px-6 py-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">在地租金行情</h1>
        <p className="text-xs text-gray-400 mt-0.5">平台累積的匿名成交資料，越多業者使用越準確</p>
      </div>

      <HowTo module="market" />

      {/* 定價建議 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-brand" />
          <span className="font-semibold text-gray-800 text-sm">我的車位定價健檢</span>
        </div>
        <select value={unitId} onChange={(e) => checkPricing(e.target.value)} className="input mb-3">
          <option value="">選擇車位查看定價建議...</option>
          {allUnits.map((u) => (
            <option key={u.id} value={u.id}>{u.propertyName} {u.unitNumber}（NT${Number(u.monthlyRent).toLocaleString()}）</option>
          ))}
        </select>
        {pricing && (
          <div className={`rounded-xl border px-4 py-3 ${POS_CLASS[pricing.position]}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-white/60">{POS_LABEL[pricing.position]}</span>
              {pricing.position !== 'NO_DATA' && (
                <span className="text-xs">{pricing.district} · 樣本 {pricing.sampleSize} 筆</span>
              )}
            </div>
            <div className="text-sm text-gray-700">{pricing.advice}</div>
            {pricing.position !== 'NO_DATA' && (
              <div className="text-xs text-gray-500 mt-2 flex gap-4">
                <span>您的租金 NT${pricing.yourRent.toLocaleString()}</span>
                <span>行情中位 NT${pricing.marketMedian.toLocaleString()}</span>
                <span>區間 NT${pricing.marketRange[0].toLocaleString()}–{pricing.marketRange[1].toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 行情總表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : comps.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm flex flex-col items-center gap-2">
          <Info className="w-8 h-8 text-gray-300" />
          目前平台資料樣本不足，行情建議將隨資料累積開放。
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400">
                <th className="text-left px-4 py-3 font-medium">區域</th>
                <th className="text-left px-4 py-3 font-medium">房型</th>
                <th className="text-right px-4 py-3 font-medium">中位數</th>
                <th className="text-right px-4 py-3 font-medium">區間</th>
                <th className="text-right px-4 py-3 font-medium">每坪</th>
                <th className="text-right px-4 py-3 font-medium">樣本</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-warm/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-700 font-medium">
                      <MapPin className="w-3 h-3 text-gray-400" />{c.district}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.type}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">NT${c.medianRent.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{c.minRent.toLocaleString()}–{c.maxRent.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{c.medianPerPing ? `NT$${c.medianPerPing.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">{c.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
