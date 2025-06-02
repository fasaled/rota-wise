
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from '@/context/language-context';
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: 'RotaWise - Doctor Scheduling',
  description: 'Fair and Balanced Doctor Scheduling Application',
  applicationName: 'RotaWise',
  appleWebApp: {
    capable: true,
    title: 'RotaWise',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  manifest: '/manifest.json',
  icons: {
    shortcut: '/favicon.ico', // Main browser tab icon
    icon: [ // Generic icons for various purposes, can be an array
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [ // Apple touch icons
      // It's good practice to list a few common sizes.
      // Browsers will pick the most appropriate one.
      // The one without sizes is often treated as the default.
      { url: '/icons/icon-180x180.png' }, // e.g., For iPhone Retina HD
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-167x167.png', sizes: '167x167', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icons/safari-pinned-tab.svg', color: '#6699CC' } // For Safari pinned tabs
    ]
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#6699CC' }, // Calming Blue
    { media: '(prefers-color-scheme: dark)', color: '#212629' }, // Dark background from globals.css .dark
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Optional: good for app-like PWAs
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* Fallback theme-color for browsers that don't support viewport.themeColor array */}
        <meta name="theme-color" content="#6699CC" />
        {/* MS Tile - Path to browserconfig should be relative to public folder */}
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#6699CC" />
      </head>
      <body className={`antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            {children}
            <Toaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
