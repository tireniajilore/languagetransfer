import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LT Runner',
  description: 'Single-lesson Language Transfer runner MVP'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
