'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import DashboardShell from '../../components/DashboardShell'
import StatusBadge from '../../components/StatusBadge'
import { Search, Copy, Eye, Trash2 } from 'lucide-react'
import Link from 'next/link'

export default function KeysPage() {
  const query = useSearchParams()
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(query.get('search') || '')
  const [statusFilter, setStatusFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')

  async function fetchKeys() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (tierFilter) params.set('tier', tierFilter)
    if (search) params.set('search', search)

    const res = await fetch(`/api/keys/list?${params.toString()}`)
    const data = await res.json()
    setKeys(data.keys || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchKeys()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [statusFilter, tierFilter])

  function handleSearch(e) {
    e.preventDefault()
    fetchKeys()
  }

  async function revokeKey(id) {
    if (!confirm('Are you sure you want to revoke this key?')) return
    await fetch(`/api/keys/${id}`, { method: 'DELETE' })
    fetchKeys()
  }

  function copyKey(key) {
    navigator.clipboard.writeText(key)
  }

  return (
    <DashboardShell title="Key Management">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-4 text-sm text-white outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Search
          </button>
        </form>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="revoked">Revoked</option>
          </select>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
          >
            <option value="">All Tiers</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
          </select>
          <Link
            href="/generate"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            Generate Key
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/50 text-slate-400">
            <tr>
              <th className="px-6 py-3 font-medium">Key</th>
              <th className="px-6 py-3 font-medium">Customer</th>
              <th className="px-6 py-3 font-medium">Tier</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Expires</th>
              <th className="px-6 py-3 font-medium">Device</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-500">Loading...</td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-500">No keys found.</td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id} className="transition hover:bg-slate-800/30">
                  <td className="px-6 py-4 font-mono text-slate-300">
                    {k.key.slice(0, 12)}…
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    <div>{k.customerEmail}</div>
                    {k.customerName && <div className="text-xs text-slate-500">{k.customerName}</div>}
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={k.subscriptionTier} /></td>
                  <td className="px-6 py-4"><StatusBadge status={k.status} /></td>
                  <td className="px-6 py-4 text-slate-400">
                    {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {k.registeredDeviceFp ? (
                      <span className="font-mono text-xs">{k.registeredDeviceFp.slice(0, 16)}…</span>
                    ) : (
                      <span className="text-xs text-slate-600">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => copyKey(k.key)}
                        className="rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                        title="Copy key"
                      >
                        <Copy size={16} />
                      </button>
                      <Link
                        href={`/keys/${k.id}`}
                        className="rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                        title="View details"
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        onClick={() => revokeKey(k.id)}
                        className="rounded p-1.5 text-slate-400 transition hover:bg-rose-900/30 hover:text-rose-400"
                        title="Revoke"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  )
}
