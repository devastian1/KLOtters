import React, { useState } from 'react';
import { Camera } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function ResilientImage({ src, alt, className = '' }: ResilientImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`bg-gradient-to-br from-[#E4ECE7] to-[#D2DFD7] flex flex-col items-center justify-center text-[#3D594E] p-4 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Camera className="w-6 h-6 mb-1.5 opacity-70" />
        <span className="text-xs font-medium text-center line-clamp-2 max-w-[180px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
