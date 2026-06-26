import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claude Code Dashboard',
  description: 'Claude Code での作業を記録・管理するパーソナルダッシュボード',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="app">
          <header className="header">
            <span className="dot" />
            <h1>Claude Code Dashboard</h1>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
