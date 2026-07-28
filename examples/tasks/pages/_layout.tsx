import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header>
        <a href="/" className="brand">borgo tasks</a>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/slow">Streaming</a>
        </nav>
      </header>
      {children}
      <footer>demo app for the borgo framework</footer>
    </div>
  );
}
