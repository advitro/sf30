'use client'

export default function StatusBadge({ status }) {
  const styles = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    inactive: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    revoked: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    past_due: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    expired: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    basic: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    pro: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }

  const style = styles[status] || styles.inactive

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  )
}
