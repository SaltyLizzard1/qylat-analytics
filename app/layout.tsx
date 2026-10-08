import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

/**
 * Inter for everything. next/font downloads it at build time and serves it
 * from this site, so the browser makes no request to Google. `swap` shows
 * the system font until it arrives, so text is never invisible.
 */
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'QYLAT Analytics',
  description: 'Private social performance dashboard',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
