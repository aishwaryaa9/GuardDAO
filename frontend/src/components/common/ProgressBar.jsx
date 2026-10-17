import React from 'react';

export function ProgressBar({
  value = 0,
  max = 100,
  color = 'indigo',
  size = 'md',
  className = '',
  showLabel = false,
  labelPrefix = '',
}) {
  const percentage = Math.min(Math.max((Number(value) / Number(max || 1)) * 100, 0), 100);

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  const colorClasses = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    cyan: 'bg-cyan-500',
    slate: 'bg-slate-400',
  };

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
          <span>{labelPrefix}</span>
          <span className="font-mono">{percentage.toFixed(1)}%</span>
        </div>
      )}
      <div className={`w-full bg-slate-800 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClasses[color] || colorClasses.indigo}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
