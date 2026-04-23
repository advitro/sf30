'use client'

import { useState } from 'react'
import DashboardShell from '../../components/DashboardShell'
import { Copy, Check } from 'lucide-react'

export default function GeneratePage() {
  const [form, setForm] = useState({
    customerEmail: '',
    customerName: '',
    tier: 'basic',
    durationMonths: '12',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
      } else {
        alert(data.error || 'Failed to generate key')
      }
    } catch {
      alert('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function copyKey() {
    if (result?.key) {
      navigator.clipboard.writeText(result.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <DashboardShell title="Generate Key">
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">New License Key</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Customer Email</label>
              <input
                type="email"
                required
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white outline-none focus:border-indigo-500"
                placeholder="customer@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Customer Name</label>
              <input
                type="text"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white outline-none focus:border-indigo-500"
                placeholder="John Doe"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Tier</label>
                <select
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Duration</label>
                <select
                  value={form.durationMonths}
                  onChange={(e) => setForm({ ...form, durationMonths: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                >
                  <option value="1">1 Month</option>
                  <option value="3">3 Months</option>
                  <option value="6">6 Months</option>
                  <option value="12">12 Months</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Key'}
            </button>
          </form>
        </div>

        {result && (
          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-6">
            <h3 className="mb-2 text-sm font-medium text-emerald-400">Key Generated</h3>
            <div className="flex items-center gap-3">
              <code className="flex-1 rounded-lg bg-slate-950 px-4 py-3 text-sm text-white">{result.key}</code>
              <button
                onClick={copyKey}
                className="rounded-lg bg-slate-800 p-3 text-slate-300 transition hover:bg-slate-700 hover:text-white"
                title="Copy"
              >
                {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Email</span>
                <p className="text-slate-200">{result.customerEmail}</p>
              </div>
              <div>
                <span className="text-slate-500">Tier</span>
                <p className="text-slate-200">{result.tier}</p>
              </div>
              <div>
                <span className="text-slate-500">Expires</span>
                <p className="text-slate-200">{new Date(result.expiresAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
