import type { Metadata } from 'next';
import './globals.css';
import { AppProviders } from '@/components/app-providers';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'MatMetrics | Judo Practice Tracker',
  description:
    'Log and analyze your Judo training sessions with AI assistance.',
  icons: {
    icon: [
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon.png', sizes: '180x180', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-body antialiased bg-background">
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
