import React from 'react';

function Logo({ size = 32 }) {
  return (
    <svg
      width={size * 4.5}
      height={size}
      viewBox="0 0 180 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="hackix-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="hackix-play" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* Play icon */}
      <rect x="2" y="4" width="32" height="32" rx="8" fill="url(#hackix-play)" />
      <polygon points="15,16 15,24 24,20" fill="#fff" />
      {/* Text */}
      <text x="44" y="29" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="22" fill="url(#hackix-grad)" letterSpacing="1">
        HACKIX
      </text>
    </svg>
  );
}

export default Logo;
