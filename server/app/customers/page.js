'use client'

import { useEffect, useState } from 'react'
import DashboardShell from '../../components/DashboardShell'
import { Search } from 'lucide-react'
import Link from 'next/link'

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function fetchData() {
    setLoading(true)
    const res = await fetch('/api/keys/list')
    const data = await res.json()
    const keys = data.keys || []

    const map = new Map()
    for (const k of keys) {
      const email = k.customerEmail
      if (!map.has(email)) {
        map.set(email, {
          email,
          name: k.customerName,
          keys: [],
        })
      }
      map.get(email).keys.push(k)
    }

    let list = Array.from(map.values())
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          (c.name && c.name.toLowerCase().includes(q))
      )
    }

    setCustomers(list)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    fetchData()
  }

  return (
    <DashboardShell title="Customer Management">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-4 text-sm text-white outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/50 text-slate-400">
            <tr>
              <th className="px-6 py-3 font-medium">Email</th>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Keys</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading...</td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No customers found.</td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.email} className="transition hover:bg-slate-800/30">
                  <td className="px-6 py-4 text-slate-300">{c.email}</td>
                  <td className="px-6 py-4 text-slate-300">{c.name || '—'}</td>
                  <td className="px-6 py-4 text-slate-300">{c.keys.length}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/keys?search=${encodeURIComponent(c.email)}`}
                      className="text-sm text-indigo-400 hover:text-indigo-300"
                    >
                      View Keys
                    </Link>
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
