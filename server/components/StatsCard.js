'use client'

export default function StatsCard({ title, value, icon: Icon, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-600/10 text-indigo-400',
    emerald: 'bg-emerald-600/10 text-emerald-400',
    amber: 'bg-amber-600/10 text-amber-400',
    rose: 'bg-rose-600/10 text-rose-400',
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        </div>
        <div className={`rounded-lg p-3 ${colors[color] || colors.indigo}`}>
          {Icon && <Icon size={24} />}
        </div>
      </div>
    </div>
  )
}
