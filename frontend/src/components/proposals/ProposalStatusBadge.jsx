import React from 'react';
import { ProposalStateMeta } from '../../utils/constants';

export function ProposalStatusBadge({ state, className = '' }) {
  const meta = ProposalStateMeta[state] || {
    label: `Unknown (${state})`,
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    dotClass: 'bg-slate-400',
  };

  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.badgeClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}
