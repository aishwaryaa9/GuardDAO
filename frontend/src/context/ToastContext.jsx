import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, Loader2, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ title, message, type = 'info', txHash = null, duration = 5000 }) => {
      const id = `${Date.now()}-${Math.random()}`;
      const newToast = { id, title, message, type, txHash };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0 && type !== 'pending') {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  const updateToast = useCallback(
    (id, updates) => {
      setToasts((prev) =>
        prev.map((t) => {
          if (t.id === id) {
            const updated = { ...t, ...updates };
            if (updates.type !== 'pending' && (!updates.duration || updates.duration > 0)) {
              setTimeout(() => {
                removeToast(id);
              }, updates.duration || 5000);
            }
            return updated;
          }
          return t;
        })
      );
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast, updateToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-in slide-in-from-bottom-2 ${
              toast.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-emerald-500/10'
                : toast.type === 'error'
                ? 'bg-slate-900/95 border-rose-500/40 text-slate-100 shadow-rose-500/10'
                : toast.type === 'pending'
                ? 'bg-slate-900/95 border-indigo-500/40 text-slate-100 shadow-indigo-500/10'
                : 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-black/30'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {toast.type === 'pending' && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
            </div>

            <div className="flex-1 min-w-0">
              {toast.title && <h4 className="text-sm font-semibold text-white">{toast.title}</h4>}
              {toast.message && (
                <p className="text-xs text-slate-300 mt-0.5 break-words leading-relaxed">
                  {toast.message}
                </p>
              )}
              {toast.txHash && (
                <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-indigo-300">
                  <span>Tx:</span>
                  <span className="truncate max-w-[200px]">{toast.txHash}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
