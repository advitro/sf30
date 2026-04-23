export const metadata = {
  title: 'Shift Grabber Admin',
  description: 'License management dashboard',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  )
}
