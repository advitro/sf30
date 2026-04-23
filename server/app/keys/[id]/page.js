'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import DashboardShell from '../../../components/DashboardShell'
import StatusBadge from '../../../components/StatusBadge'
import { Copy, ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

export default function KeyDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [keyData, setKeyData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [edit, setEdit] = useState({})

  async function fetchKey() {
    setLoading(true)
    const res = await fetch(`/api/keys/list`)
    const data = await res.json()
    const found = (data.keys || []).find((k) => k.id === id)
    setKeyData(found || null)
    if (found) {
      setEdit({
        status: found.status,
        subscriptionTier: found.subscriptionTier,
        subscriptionStatus: found.subscriptionStatus,
        expiresAt: found.expiresAt ? new Date(found.expiresAt).toISOString().slice(0, 10) : '',
        telegramBotToken: found.telegramBotToken || '',
        telegramChatId: found.telegramChatId || '',
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchKey()
  }, [id])

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/keys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: edit.status,
        subscriptionTier: edit.subscriptionTier,
        subscriptionStatus: edit.subscriptionStatus,
        expiresAt: edit.expiresAt || null,
        telegramBotToken: edit.telegramBotToken || null,
        telegramChatId: edit.telegramChatId || null,
      }),
    })
    setSaving(false)
    fetchKey()
  }

  function copyKey(key) {
    navigator.clipboard.writeText(key)
  }

  if (loading) {
    return (
      <DashboardShell title="Key Detail">
        <p className="text-slate-500">Loading...</p>
      </DashboardShell>
    )
  }

  if (!keyData) {
    return (
      <DashboardShell title="Key Detail">
        <p className="text-slate-500">Key not found.</p>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="Key Detail">
      <div className="mb-6">
        <Link href="/keys" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Back to keys
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Key Information</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Key</span>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-slate-950 px-2 py-1 text-sm text-slate-200">{keyData.key}</code>
                  <button onClick={() => copyKey(keyData.key)} className="text-slate-400 hover:text-white">
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">ID</span>
                <span className="text-sm text-slate-300">{keyData.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Created</span>
                <span className="text-sm text-slate-300">{new Date(keyData.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Updated</span>
                <span className="text-sm text-slate-300">{new Date(keyData.updatedAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Last Seen</span>
                <span className="text-sm text-slate-300">
                  {keyData.lastSeenAt ? new Date(keyData.lastSeenAt).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Customer Details</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Email</span>
                <span className="text-sm text-slate-300">{keyData.customerEmail}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Name</span>
                <span className="text-sm text-slate-300">{keyData.customerName || '—'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Device Info</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Registered Fingerprint</span>
                <span className="font-mono text-sm text-slate-300">
                  {keyData.registeredDeviceFp ? keyData.registeredDeviceFp.slice(0, 32) + '…' : 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Edit Key</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Status</label>
                <select
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="revoked">Revoked</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Tier</label>
                <select
                  value={edit.subscriptionTier}
                  onChange={(e) => setEdit({ ...edit, subscriptionTier: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Subscription Status</label>
                <select
                  value={edit.subscriptionStatus}
                  onChange={(e) => setEdit({ ...edit, subscriptionStatus: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Expires At</label>
                <input
                  type="date"
                  value={edit.expiresAt}
                  onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div className="border-t border-slate-800 pt-4">
                <h3 className="mb-3 text-sm font-medium text-slate-300">Telegram Config</h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Bot Token</label>
                    <input
                      type="text"
                      value={edit.telegramBotToken}
                      onChange={(e) => setEdit({ ...edit, telegramBotToken: e.target.value })}
                      placeholder="123456:ABC-DEF..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">Chat ID</label>
                    <input
                      type="text"
                      value={edit.telegramChatId}
                      onChange={(e) => setEdit({ ...edit, telegramChatId: e.target.value })}
                      placeholder="-1001234567890"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Payment Info</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Payment Status</span>
                <StatusBadge status={keyData.paymentStatus} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Stripe Customer</span>
                <span className="font-mono text-xs text-slate-300">{keyData.stripeCustomerId || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Stripe Subscription</span>
                <span className="font-mono text-xs text-slate-300">{keyData.stripeSubscriptionId || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
