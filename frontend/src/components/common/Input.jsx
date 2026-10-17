import React from 'react';

export function Input({
  label,
  helperText,
  error,
  type = 'text',
  className = '',
  prefix,
  suffix,
  ...props
}) {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-slate-300">
          {label}
        </label>
      )}

      <div className="relative flex items-center rounded-xl bg-slate-900/90 border border-slate-700/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-colors">
        {prefix && (
          <span className="pl-3.5 pr-2 text-xs text-slate-400 select-none">
            {prefix}
          </span>
        )}

        <input
          type={type}
          className={`w-full bg-transparent px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...props}
        />

        {suffix && (
          <span className="pr-3.5 pl-2 text-xs text-slate-400 select-none">
            {suffix}
          </span>
        )}
      </div>

      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-400">{helperText}</p>
      ) : null}
    </div>
  );
}

export function Textarea({
  label,
  helperText,
  error,
  rows = 4,
  className = '',
  ...props
}) {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-slate-300">
          {label}
        </label>
      )}

      <div className="rounded-xl bg-slate-900/90 border border-slate-700/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-colors">
        <textarea
          rows={rows}
          className={`w-full bg-transparent p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed resize-y ${className}`}
          {...props}
        />
      </div>

      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-400">{helperText}</p>
      ) : null}
    </div>
  );
}
