import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/app-providers';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MatMetrics | Judo Practice Tracker',
  description:
    'Log and analyze your Judo training sessions with AI assistance.',
  icons: {
    icon: [{ url: '/icon.png', sizes: '200x200', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-body antialiased bg-background">
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
