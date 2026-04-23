import DashboardShell from '../components/DashboardShell'
import StatsCard from '../components/StatsCard'
import StatusBadge from '../components/StatusBadge'
import { prisma } from '../lib/prisma'
import { KeyRound, Activity, Clock, DollarSign } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const totalKeys = await prisma.apiKey.count()
  const activeKeys = await prisma.apiKey.count({ where: { status: 'active' } })
  const expiredKeys = await prisma.apiKey.count({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { subscriptionStatus: 'expired' },
      ],
    },
  })

  return (
    <DashboardShell title="Dashboard">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Keys" value={totalKeys} icon={KeyRound} color="indigo" />
        <StatsCard title="Active" value={activeKeys} icon={Activity} color="emerald" />
        <StatsCard title="Expired" value={expiredKeys} icon={Clock} color="amber" />
        <StatsCard title="Revenue" value="—" icon={DollarSign} color="rose" />
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Keys</h2>
          <Link href="/keys" className="text-sm text-indigo-400 hover:text-indigo-300">
            View all
          </Link>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-slate-400">
              <tr>
                <th className="px-6 py-3 font-medium">Key</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Tier</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {keys.map((k) => (
                <tr key={k.id} className="transition hover:bg-slate-800/30">
                  <td className="px-6 py-4 font-mono text-slate-300">{k.key.slice(0, 16)}…</td>
                  <td className="px-6 py-4 text-slate-300">{k.customerEmail}</td>
                  <td className="px-6 py-4"><StatusBadge status={k.subscriptionTier} /></td>
                  <td className="px-6 py-4"><StatusBadge status={k.status} /></td>
                  <td className="px-6 py-4 text-slate-400">
                    {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No keys yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-4 text-base font-semibold text-white">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/generate"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Generate Key
            </Link>
            <Link
              href="/keys"
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
            >
              Manage Keys
            </Link>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
