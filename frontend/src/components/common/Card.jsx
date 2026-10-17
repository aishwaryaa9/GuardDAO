import React from 'react';

export function Card({
  children,
  title,
  subtitle,
  action,
  className = '',
  bodyClassName = '',
  glass = true,
  glow = false,
  ...props
}) {
  return (
    <div
      className={`rounded-2xl border transition-all duration-200 ${
        glass ? 'glass-panel border-slate-800/80' : 'bg-slate-900 border-slate-800'
      } ${glow ? 'glow-purple' : ''} ${className}`}
      {...props}
    >
      {(title || subtitle || action) && (
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80">
          <div>
            {title && <h3 className="text-base font-semibold text-white tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={`p-6 ${bodyClassName}`}>{children}</div>
    </div>
  );
}
