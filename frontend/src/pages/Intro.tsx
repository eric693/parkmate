import { Link } from 'react-router-dom';
import { Home, Clock, Bell, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { HOWTO, INTRO_GROUPS } from '../content/howto';

/** 免登入的系統介紹頁，給老闆與新進人員快速了解整套系統怎麼運作。 */
export default function Intro() {
  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-brand rounded-lg flex items-center justify-center">
              <Home className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-bold text-gray-800 leading-tight">ParkMate 微停</div>
              <div className="text-xs text-gray-400">停車位月租平台 · 系統介紹</div>
            </div>
          </div>
          <Link to="/login" className="btn-primary text-sm flex items-center gap-1.5">
            進入系統 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* 這套系統在解決什麼 */}
        <section className="mb-10">
          <h1 className="text-2xl font-bold text-gray-800 mb-3">這套系統在解決什麼</h1>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            多業者與停車場管理最耗神的不是「記帳」，而是<strong>每個月重複的追蹤</strong>：
            誰還沒繳、台電總單怎麼拆給每一間、合約什麼時候到期、押金要退多少。
            ParkMate 把這些變成自動排程與固定流程——租金單自己產生、該催的自己催、
            該提醒的提前提醒，業者只要處理真正需要判斷的那幾筆。
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { t: '收租不用自己記', d: '每月 1 日自動產生租金單，到期前、到期日、逾期後自動發 LINE 提醒。' },
              { t: '水電一單拆到底', d: '台電／自來水總單登錄一次，依平均、坪數、人頭或實際度數拆到每間房；預付電表另有餘額與用完日期推估。' },
              { t: '到期前就知道', d: '合約到期、電費見底都在發生前先通知；每種通知的時間與提前天數都能自己設。' },
            ].map((c) => (
              <div key={c.t} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle2 className="w-4 h-4 text-brand" />
                  <span className="font-semibold text-gray-800 text-sm">{c.t}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 自動通知時間表 */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-brand" />
            <h2 className="text-lg font-bold text-gray-800">自動通知時間表</h2>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            下表為預設值。<strong>每一種通知的執行時間（時、分）與參數都可以在「設定 → 通知設定」各自調整</strong>，
            改完即時生效。全部以台北時間執行，通知經 LINE 發送；車主須先完成 LINE 綁定才收得到。
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">時機</th>
                    <th className="text-left font-medium px-4 py-2.5">動作</th>
                    <th className="text-left font-medium px-4 py-2.5">通知對象</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    ['每月 1 日 08:00', '依進行中合約產生當月租金單', '—'],
                    ['每天 09:00 · 到期前 3 天', '繳租提醒（可設提前天數、到期當天是否再發）', '車主'],
                    ['每天 09:00 · 逾期每 3 天', '標記逾期並催繳', '車主'],
                    ['每天 09:00（有逾期時）', '逾期彙整通知', '業者'],
                    ['每天 09:00 · 到期前 30/14/7 天', '合約到期提醒（天數可複選）', '業者 + 車主'],
                    ['每天 09:00 · 餘額低於 NT$300', '預付電費餘額不足告警', '業者 + 車主'],
                    ['報修單建立當下', '新報修通知（即時，不走排程）', '業者'],
                    ['水電帳單（非預付制）', '手動按「通知車主」才發送', '車主'],
                  ].map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{r[0]}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r[1]}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-3 flex gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-orange-800 leading-relaxed">
              合約到期提醒走到你設定的最小天數（預設 7 天）時，系統會自動把合約轉為「已到期」、車位轉為「空位」。
              若已談妥續約，請在那之前更新合約起訖日。
            </p>
          </div>
        </section>

        {/* 上手流程 */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-brand" />
            <h2 className="text-lg font-bold text-gray-800">第一次使用：五步驟上線</h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <ol className="space-y-3">
              {[
                ['建立停車場與車位', '車位 → 新增停車場 → 逐間新增車位編號，坪數與可住人數務必填寫，水電分攤會用到。'],
                ['建立車主並綁定 LINE', '車主 → 新增車主 → 產生 LINE 邀請碼交給車主，未綁定就收不到任何通知。'],
                ['建立合約並發租約書', '合約 → 新增合約填月租金、押金與繳租日；再點「租約書」編輯契約條款，傳送給車主線上簽署。'],
                ['設定通知時機', '設定 → 通知設定，六種通知各自設定執行時間與參數，並綁定業者本人的 LINE。'],
                ['開始每月收租', '每月 1 日租金單自動產生，之後在收款工作台確認收款、催繳、登錄水電即可。'],
              ].map(([t, d], i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">{t}</div>
                    <div className="text-xs text-gray-500 leading-relaxed mt-0.5">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 模組總覽 */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-800 mb-1">模組總覽</h2>
          <p className="text-xs text-gray-400 mb-4">
            共 {Object.keys(HOWTO).length} 個模組。每個模組在系統內都有可展開的「操作說明」，內容與下方一致。
          </p>

          <div className="space-y-6">
            {INTRO_GROUPS.map(({ group, keys }) => (
              <div key={group}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-1 h-4 bg-brand rounded-full" />
                  <h3 className="font-bold text-gray-700 text-sm">{group}</h3>
                </div>
                <div className="space-y-3">
                  {keys.map((k) => {
                    const m = HOWTO[k];
                    if (!m) return null;
                    return (
                      <div key={k} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="font-semibold text-gray-800 text-sm mb-1">{m.title}</div>
                        <p className="text-xs text-gray-500 leading-relaxed mb-3">{m.purpose}</p>
                        <ol className="space-y-1.5">
                          {m.steps.map((s, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-xs text-brand font-bold flex-shrink-0">{i + 1}.</span>
                              <span className="text-xs text-gray-600 leading-relaxed">{s}</span>
                            </li>
                          ))}
                        </ol>
                        {m.notes && m.notes.length > 0 && (
                          <div className="mt-2.5 pt-2.5 border-t border-gray-50 space-y-1">
                            {m.notes.map((n, i) => (
                              <div key={i} className="flex gap-1.5">
                                <AlertCircle className="w-3 h-3 text-orange-400 flex-shrink-0 mt-0.5" />
                                <span className="text-xs text-gray-400 leading-relaxed">{n}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 安裝到手機 */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-800 mb-3">裝到手機上用</h2>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              ParkMate 是 PWA，可以直接加到手機主畫面，開起來跟一般 App 一樣是全螢幕，不用經過商店安裝。
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="border border-gray-100 rounded-xl p-3">
                <div className="font-semibold text-gray-700 text-sm mb-1">Android / Chrome</div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  登入後畫面右下角會跳出「安裝 ParkMate」，點「加入主畫面」即可；
                  或用瀏覽器選單的「安裝應用程式」。
                </p>
              </div>
              <div className="border border-gray-100 rounded-xl p-3">
                <div className="font-semibold text-gray-700 text-sm mb-1">iPhone / Safari</div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  點下方工具列的分享鍵，往下捲選「加入主畫面」，再按「新增」。
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              長按主畫面圖示還有捷徑可直接跳到收款工作台、預付電費或報修管理。
              離線時可開啟 App 外框，但帳務數字一律即時向伺服器取得，不會給你看過期的餘額。
            </p>
          </div>
        </section>

        {/* 邊界說明 */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-800 mb-3">系統不做什麼</h2>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
            {[
              '不代收租金：系統做的是帳務追蹤與對帳，金流仍走業者自己的銀行帳戶或虛擬帳號。',
              '不推送到 591 或 Facebook：空位刊登只管理文案與刊登狀態紀錄。',
              '不自動抄表：預付電表的度數需人工登錄（或由業者抄表後輸入），系統不會連線讀取電表。',
              '不代收電費：儲值金額由業者實際收款後登錄，系統只記帳與告警。',
              '報稅表為申報參考資料，非報稅系統上傳檔，仍需本人或會計師核對後申報。',
            ].map((t, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-300 flex-shrink-0">·</span>
                <span className="text-xs text-gray-500 leading-relaxed">{t}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="text-center pb-8">
          <Link to="/login" className="btn-primary inline-flex items-center gap-1.5">
            進入系統 <ArrowRight className="w-4 h-4" />
          </Link>
          <div className="text-xs text-gray-300 mt-4">ParkMate 停車位月租後台 v1.0.0</div>
        </div>
      </main>
    </div>
  );
}
