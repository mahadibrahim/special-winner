import type React from "react"

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="font-sans antialiased min-h-screen">
      {children}
    </div>
  )
}
