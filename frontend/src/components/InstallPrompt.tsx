import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

// 「加入主畫面」提示。
// Android/Chrome 會給 beforeinstallprompt 事件，可直接叫出安裝視窗；
// iOS Safari 沒有這個事件，只能教使用者用「分享 → 加入主畫面」。

const DISMISS_KEY = 'pwa-install-dismissed';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch { /* 無痕視窗讀不到就照常顯示 */ }

    // 已經以 App 形式開啟就不用再提示
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && isSafari) setShowIos(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    setDeferred(null);
    setShowIos(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* 忽略 */ }
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!deferred && !showIos) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-white border border-gray-200 rounded-2xl shadow-lg p-4">
      <button onClick={dismiss} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-brand/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Download className="w-4 h-4 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-800 text-sm">安裝 ParkMate</div>
          {deferred ? (
            <>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                加到主畫面，開啟更快，也能像 App 一樣全螢幕使用。
              </p>
              <button onClick={install} className="btn-primary text-xs w-full mt-2 py-1.5">加入主畫面</button>
            </>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              點下方的分享鍵 <Share className="w-3 h-3 inline text-brand" /> ，選「加入主畫面」即可像 App 一樣使用。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
