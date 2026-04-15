import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Language Transfer Spanish',
  description: 'Interactive Spanish lessons built around the Language Transfer thinking method'
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
