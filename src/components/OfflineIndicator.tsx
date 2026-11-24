import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-[#8C490F] px-3.5 py-2 text-xs font-medium text-white shadow-lg border border-[#F2D5B8]/30"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline mode · Showing cached KLOtters sightings</span>
    </div>
  );
};
