'use client'

export default function Navbar({ title }) {
  return (
    <header className="flex h-16 items-center border-b border-slate-800 bg-slate-900/50 px-8 backdrop-blur">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
    </header>
  )
}
