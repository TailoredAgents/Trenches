import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trenches Control Center',
  description: 'Live telemetry and controls for the Solana narrative sniper.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="layout">
        <main className="content">{children}</main>
      </body>
    </html>
  );
}
