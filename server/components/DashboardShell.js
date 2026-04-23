'use client'

import Sidebar from './Sidebar'
import Navbar from './Navbar'

export default function DashboardShell({ children, title }) {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <div className="ml-64 flex flex-1 flex-col">
        <Navbar title={title} />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  )
}
