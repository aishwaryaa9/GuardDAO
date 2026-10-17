import React from 'react';

export function LoadingSkeleton({ className = '', lines = 1 }) {
  if (lines > 1) {
    return (
      <div className="space-y-2.5 animate-pulse">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`bg-slate-800/80 rounded-lg h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'} ${className}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`bg-slate-800/80 rounded-lg animate-pulse ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-800/80 p-6 glass-panel animate-pulse space-y-4">
      <div className="flex justify-between items-center">
        <div className="w-1/3 h-5 bg-slate-800 rounded" />
        <div className="w-16 h-5 bg-slate-800 rounded-full" />
      </div>
      <div className="w-2/3 h-4 bg-slate-800/60 rounded" />
      <div className="w-full h-8 bg-slate-800/40 rounded mt-4" />
    </div>
  );
}
