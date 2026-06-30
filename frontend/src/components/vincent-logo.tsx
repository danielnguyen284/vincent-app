"use client";

import React from "react";

interface VincentLogoProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export function VincentLogo({ className = "", size = 32, animated = false }: VincentLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${animated ? "animate-pulse" : ""}`}
    >
      <defs>
        <linearGradient id="vincentLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--primary-gradient-end, #10b981)" />
        </linearGradient>
      </defs>

      {/* Sleek V Shape */}
      <path
        d="M15,15 L32,15 L50,60 L68,15 L85,15 L50,90 Z"
        fill="url(#vincentLogoGrad)"
      />

      {/* Sleek nested house shape with cut-out window */}
      <path
        d="M50,22 L37,34 L41,34 L41,52 L59,52 L59,34 L63,34 Z M47,42 L53,42 L53,48 L47,48 Z"
        fill="url(#vincentLogoGrad)"
        fillRule="evenodd"
      />
    </svg>
  );
}
