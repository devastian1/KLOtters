import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [guidePlatform, setGuidePlatform] = useState<'ios' | 'android' | null>(null);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="px-3.5 py-2 text-xs font-medium text-[#0D6E59] bg-[#EAF3EF] border border-[#BBD6CB] rounded-xl hover:bg-[#DCECE5] hover:border-[#0D6E59]/50 transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isAndroid || isIOS) {
    const platform = isIOS ? 'ios' : 'android';
    return (
      <>
        <button
          type="button"
          onClick={() => setGuidePlatform(platform)}
          className="px-3.5 py-2 text-xs font-medium text-[#0D6E59] bg-[#EAF3EF] border border-[#BBD6CB] rounded-xl hover:bg-[#DCECE5] hover:border-[#0D6E59]/50 transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>{isIOS ? 'Install on iOS' : 'Android App'}</span>
        </button>

        {guidePlatform && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-guide-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white border border-[#D7E0D6] p-6 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3
                    id="pwa-install-guide-title"
                    className="font-display text-lg font-bold text-[#141E1A]"
                  >
                    {guidePlatform === 'ios'
                      ? 'Install KLOtters on iPhone / iPad'
                      : 'Install KLOtters on Android'}
                  </h3>
                  <p className="text-xs text-[#4A5A52]">
                    Add KLOtters directly to your home screen for full-screen app mode and offline access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGuidePlatform(null)}
                  aria-label="Close install instructions"
                  className="p-1.5 rounded-lg text-[#5D6D64] hover:text-[#141E1A] hover:bg-[#F3F6F3] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {guidePlatform === 'ios' ? (
                <ol className="space-y-2 text-xs text-[#2B3A33] leading-relaxed list-decimal list-inside">
                  <li>
                    Tap the <strong>Share</strong> icon in Safari&apos;s browser toolbar.
                  </li>
                  <li>
                    Scroll down and select <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong> to launch KLOtters as a standalone app.
                  </li>
                </ol>
              ) : (
                <ol className="space-y-2 text-xs text-[#2B3A33] leading-relaxed list-decimal list-inside">
                  <li>
                    Open this page directly in <strong>Chrome for Android</strong> (outside embedded previews).
                  </li>
                  <li>
                    Tap the browser menu (<strong>⋮</strong>) in the top-right corner.
                  </li>
                  <li>
                    Select <strong>Install app</strong> or <strong>Add to Home screen</strong> to install KLOtters in your Android app drawer.
                  </li>
                </ol>
              )}

              <button
                type="button"
                onClick={() => setGuidePlatform(null)}
                className="w-full py-2.5 rounded-xl bg-[#0D6E59] text-white text-xs font-medium hover:bg-[#095444] transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
