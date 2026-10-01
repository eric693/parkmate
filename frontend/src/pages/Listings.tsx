import { useEffect, useState } from 'react';
import {
  Home, Plus, Copy, Check, ExternalLink, Trash2, X, RefreshCw,
  Building2, MapPin, Tag, Calendar, ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '../api/client';
import HowTo from '../components/HowTo';
import SearchBox, { matches } from '../components/SearchBox';
import type { Unit } from '../types';
import { SPOT_TYPE_LABEL, VEHICLE_KIND_LABEL, floorLabel, unitSpecLabels } from '../lib/parking';

interface ListingRecord {
  id: string;
  platform: string;
  url?: string;
  notes?: string;
  status: string;
  listedAt: string;
  expiresAt?: string;
}

interface VacantUnit extends Pick<Unit, 'floor' | 'type' | 'vehicleKind' | 'spotType' | 'maxHeightCm' | 'maxWidthCm' | 'hasCharger' | 'dailyRate' | 'weeklyRate'> {
  id: string;
  unitNumber: string;
  monthlyRent: number;
  description?: string;
  propertyName: string;
  propertyAddress: string;
  listings: ListingRecord[];
}

const PLATFORMS = [
  { key: '591', label: '591 房屋交易', color: 'bg-red-100 text-red-700', url: 'https://house.591.com.tw/' },
  { key: 'facebook', label: 'Facebook 社團', color: 'bg-blue-100 text-blue-700', url: 'https://www.facebook.com/' },
  { key: 'dcard', label: 'Dcard', color: 'bg-green-100 text-green-700', url: 'https://www.dcard.tw/' },
  { key: 'line', label: 'LINE 社群', color: 'bg-green-100 text-green-700', url: '' },
  { key: 'other', label: '其他平台', color: 'bg-gray-100 text-gray-700', url: '' },
];

function generateCopy(unit: VacantUnit): string {
  const kind = [unit.vehicleKind ? VEHICLE_KIND_LABEL[unit.vehicleKind] : '', unit.spotType ? SPOT_TYPE_LABEL[unit.spotType] : unit.type ?? '']
    .filter(Boolean).join('・');
  const limits = [unit.maxHeightCm ? `限高 ${unit.maxHeightCm} 公分` : '', unit.maxWidthCm ? `限寬 ${unit.maxWidthCm} 公分` : ''].filter(Boolean).join('、');
  const shortRates = [
    unit.dailyRate ? `日租 NT$${Number(unit.dailyRate).toLocaleString()}` : '',
    unit.weeklyRate ? `週租 NT$${Number(unit.weeklyRate).toLocaleString()}` : '',
  ].filter(Boolean).join('／');
  const lines = [
    `🅿️【車位出租】${unit.propertyName} ${unit.unitNumber}`,
    ``,
    `📍 地址：${unit.propertyAddress}`,
    unit.floor != null ? `🏢 樓層：${floorLabel(unit.floor)}` : '',
    kind ? `🚗 車位：${kind}` : '',
    limits ? `📏 ${limits}` : '',
    unit.hasCharger ? `⚡ 附電動車充電樁` : '',
    `💰 月租：NT$${Number(unit.monthlyRent).toLocaleString()}（季繳、年繳另有優惠可談）`,
    shortRates ? `🕐 短租：${shortRates}` : '',
    ``,
    `✅ 特色：`,
    `  • 固定車位，不用每天找位子`,
    `  • 遙控器／感應卡進出`,
    `  • 隨時可起租`,
    unit.description ? `\n📝 備注：${unit.description}` : '',
    ``,
    `📞 請私訊洽詢，謝謝！`,
  ].filter((l) => l !== undefined && l !== null);
  return lines.join('\n').replace(/\n\n\n/g, '\n\n').trim();
}

export default function Listings() {
  const [units, setUnits] = useState<VacantUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [addingListing, setAddingListing] = useState<string | null>(null);
  const [listingForm, setListingForm] = useState({ platform: '591', url: '', notes: '', expiresAt: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<'ALL' | 'LISTED' | 'UNLISTED'>('ALL');

  useEffect(() => { fetchUnits(); }, []);

  async function fetchUnits() {
    setLoading(true);
    const r = await api.get('/listings/vacant');
    setUnits(r.data);
    setLoading(false);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    showToast('已複製到剪貼簿');
  }

  async function submitListing(unitId: string) {
    setSaving(true);
    try {
      await api.post(`/listings/units/${unitId}`, listingForm);
      setAddingListing(null);
      setListingForm({ platform: '591', url: '', notes: '', expiresAt: '' });
      fetchUnits();
      showToast('刊登紀錄已新增');
    } catch { showToast('新增失敗'); }
    setSaving(false);
  }

  async function removeListing(id: string) {
    if (!confirm('確定刪除此刊登紀錄？')) return;
    await api.delete(`/listings/${id}`);
    fetchUnits();
    showToast('已刪除');
  }

  async function toggleListingStatus(listing: ListingRecord) {
    const next = listing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await api.put(`/listings/${listing.id}`, { status: next });
    fetchUnits();
  }

  const platformInfo = (key: string) => PLATFORMS.find((p) => p.key === key) ?? PLATFORMS[4];

  return (
    <div className="px-6 py-6 max-w-4xl relative">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="page-header items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">空位刊登</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {units.length} 間空位 · 管理招租文案與刊登狀態
          </p>
        </div>
      </div>

      <HowTo module="listings" />

      {units.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100">
            {([['ALL', '全部空位'], ['LISTED', '刊登中'], ['UNLISTED', '尚未刊登']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setListFilter(k)}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${listFilter === k ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <SearchBox value={search} onChange={setSearch} placeholder="搜尋停車場、地址、車位編號、平台" />
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : units.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <Home className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <div className="text-gray-400 text-sm">目前沒有空位</div>
          <div className="text-gray-300 text-xs mt-1">所有車位均已出租</div>
        </div>
      ) : (
        <div className="space-y-4">
          {units
            .filter((u) => {
              const listed = u.listings.some((l) => l.status === 'ACTIVE');
              return (listFilter === 'ALL' || (listFilter === 'LISTED' ? listed : !listed))
                && matches(search, u.propertyName, u.propertyAddress, u.unitNumber, u.type, ...u.listings.map((l) => `${l.platform} ${l.notes ?? ''}`));
            })
            .map((unit) => {
            const isOpen = expanded === unit.id;
            const copyText_ = generateCopy(unit);
            const activeListings = unit.listings.filter((l) => l.status === 'ACTIVE');

            return (
              <div key={unit.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Unit header */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-warm rounded-xl flex items-center justify-center flex-shrink-0">
                        <Home className="w-5 h-5 text-brand" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-800">{unit.unitNumber}</span>
                          {unitSpecLabels(unit).map((l) => (
                            <span key={l} className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">{l}</span>
                          ))}
                          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">空位</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                          <Building2 className="w-3 h-3" />{unit.propertyName}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                          <MapPin className="w-3 h-3" />{unit.propertyAddress}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-brand text-lg">NT${Number(unit.monthlyRent).toLocaleString()}</div>
                      <div className="text-xs text-gray-400">/月</div>
                    </div>
                  </div>

                  {/* Active listing badges */}
                  {activeListings.length > 0 && (
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {activeListings.map((l) => {
                        const p = platformInfo(l.platform);
                        return (
                          <span key={l.id} className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${p.color}`}>
                            <Tag className="w-3 h-3" />{p.label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => copyText(copyText_, unit.id)}
                      className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      {copied === unit.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                      複製招租文案
                    </button>
                    <button
                      onClick={() => { setAddingListing(unit.id); setExpanded(unit.id); }}
                      className="flex items-center gap-1.5 text-xs border border-brand/30 rounded-lg px-3 py-1.5 text-brand hover:bg-brand/5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />新增刊登
                    </button>
                    <button
                      onClick={() => setExpanded(isOpen ? null : unit.id)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 ml-auto transition-colors"
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {isOpen ? '收合' : '展開'}
                    </button>
                  </div>
                </div>

                {/* Expanded section */}
                {isOpen && (
                  <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-4">
                    {/* Generated copy preview */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-600">招租文案預覽</span>
                        <button
                          onClick={() => copyText(copyText_, unit.id + '_text')}
                          className="flex items-center gap-1 text-xs text-brand hover:underline"
                        >
                          {copied === unit.id + '_text' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          複製
                        </button>
                      </div>
                      <pre className="bg-warm rounded-xl p-3 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-sans border border-gray-100">
                        {copyText_}
                      </pre>
                    </div>

                    {/* Add listing form */}
                    {addingListing === unit.id && (
                      <div className="bg-brand/5 border border-brand/20 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-brand">新增刊登紀錄</span>
                          <button onClick={() => setAddingListing(null)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">刊登平台</label>
                            <select
                              value={listingForm.platform}
                              onChange={(e) => setListingForm({ ...listingForm, platform: e.target.value })}
                              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand bg-white"
                            >
                              {PLATFORMS.map((p) => (
                                <option key={p.key} value={p.key}>{p.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">刊登連結（選填）</label>
                            <input
                              type="url"
                              placeholder="https://..."
                              value={listingForm.url}
                              onChange={(e) => setListingForm({ ...listingForm, url: e.target.value })}
                              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand bg-white"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">下架日期（選填）</label>
                              <input
                                type="date"
                                value={listingForm.expiresAt}
                                onChange={(e) => setListingForm({ ...listingForm, expiresAt: e.target.value })}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">備注</label>
                              <input
                                type="text"
                                placeholder="選填"
                                value={listingForm.notes}
                                onChange={(e) => setListingForm({ ...listingForm, notes: e.target.value })}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand bg-white"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => submitListing(unit.id)}
                              disabled={saving}
                              className="flex-1 btn-primary text-sm flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                              {saving ? '儲存中...' : '確認新增'}
                            </button>
                            {(() => {
                              const pInfo = platformInfo(listingForm.platform);
                              return pInfo.url ? (
                                <a
                                  href={pInfo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />前往刊登
                                </a>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Existing listings */}
                    {unit.listings.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-2">刊登紀錄</div>
                        <div className="space-y-2">
                          {unit.listings.map((l) => {
                            const p = platformInfo(l.platform);
                            const isActive = l.status === 'ACTIVE';
                            return (
                              <div
                                key={l.id}
                                className={`flex items-center justify-between border rounded-xl px-3 py-2.5 ${isActive ? 'border-gray-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.color}`}>{p.label}</span>
                                  <div className="text-xs text-gray-400">
                                    <div className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(l.listedAt).toLocaleDateString('zh-TW')}
                                      {l.expiresAt && ` ～ ${new Date(l.expiresAt).toLocaleDateString('zh-TW')}`}
                                    </div>
                                    {l.notes && <div className="mt-0.5">{l.notes}</div>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {l.url && (
                                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-brand transition-colors">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  <button
                                    onClick={() => toggleListingStatus(l)}
                                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${isActive ? 'border-green-200 text-green-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200' : 'border-gray-200 text-gray-400 hover:bg-green-50 hover:text-green-600 hover:border-green-200'}`}
                                  >
                                    {isActive ? '刊登中' : '已下架'}
                                  </button>
                                  <button onClick={() => removeListing(l.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
