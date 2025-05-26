
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster for app-wide notifications
import { LanguageProvider } from '@/context/language-context';

// Metadata might need to be dynamic if title/description need translation,
// but for now, keeping it static or in one primary language.
// For fully dynamic metadata, Next.js recommends generateMetadata function.
export const metadata: Metadata = {
  title: 'RotaWise - Doctor Scheduling', // Consider making this dynamic later if needed
  description: 'Fair and Balanced Doctor Scheduling Application',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`antialiased bg-background text-foreground`}>
        <LanguageProvider>
          {children}
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
