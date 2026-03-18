import type { Metadata } from 'next';
import './globals.css';
import { AppProviders } from '@/components/app-providers';

export const metadata: Metadata = {
  title: 'MatMetrics | Judo Practice Tracker',
  description:
    'Log and analyze your Judo training sessions with AI assistance.',
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
      </body>
    </html>
  );
}
