import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header>
        <a href="/" className="brand">
          <img src="/logo.svg" alt="" width={28} height={28} />
          borgo tasks
        </a>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/slow">Streaming</a>
          <a href="/hydration">Hydration</a>
          <a href="/islands">Islands</a>
          <a href="/live">Live</a>
        </nav>
      </header>
      {children}
      <footer>demo app for the borgo framework — edited</footer>
    </div>
  );
}
