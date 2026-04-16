
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { LanguageProvider } from '@/context/language-context';
import { ThemeProvider } from "@/components/theme-provider";
import { FileSystemProvider } from '@/context/file-system-context';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fasl.dev';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Rotawise - Doctor Scheduling',
    template: '%s | Rotawise',
  },
  description: 'Fair and Balanced Doctor Scheduling Application. Create, manage, and optimize doctor rotas efficiently with Rotawise. PWA-enabled for offline use.',
  applicationName: 'Rotawise',
  keywords: ['doctor scheduling', 'rota management', 'physician schedule', 'medical rota', 'on-call schedule', 'fair scheduling', 'balanced rota', 'PWA', 'Rotawise', 'schedule optimization'],
  authors: [{ name: 'Rotawise Team', url: APP_URL }],
  creator: 'Rotawise Team',
  publisher: 'Rotawise Team',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: 'Rotawise - Efficient & Fair Doctor Scheduling',
    description: 'Optimize doctor rotas seamlessly with Rotawise. Ensure fair, balanced schedules with an easy-to-use, PWA-enabled application.',
    url: APP_URL,
    siteName: 'Rotawise',
    images: [
      {
        url: '/icons/og-image-1200x630.png', // User needs to create this image at public/icons/og-image-1200x630.png
        width: 1200,
        height: 630,
        alt: 'Rotawise Application Interface for Doctor Scheduling',
      },
    ],
    locale: 'en_US', // Adjust if your primary language is different or handle dynamically
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rotawise - Smart Doctor Scheduling Solution',
    description: 'Streamline your doctor scheduling process with Rotawise. Fair, balanced, and easy to manage rotas.',
    // site: '@YourTwitterAppHandle', // Optional: Your app's Twitter handle
    creator: '@YourTwitterHandle', // Optional: Creator's Twitter handle (replace or remove)
    images: ['/icons/twitter-image-1200x600.png'], // User needs to create this image at public/icons/twitter-image-1200x600.png
  },
  appleWebApp: {
    capable: true,
    title: 'Rotawise',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  manifest: '/manifest.json',
  icons: {
    shortcut: '/favicon.ico',
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: 'any' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-180x180.png' }, // Apple touch icon
      { url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-167x167.png', sizes: '167x167', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icons/safari-pinned-tab.svg', color: '#6699CC' }
    ]
  },
  alternates: {
    canonical: APP_URL,
    // If you add language-specific paths like /en, /es, uncomment and adjust:
    // languages: {
    //   'en-US': `${APP_URL}/en`,
    //   'es-ES': `${APP_URL}/es`,
    // },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#6699CC' },
    { media: '(prefers-color-scheme: dark)', color: '#212629' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
            <FileSystemProvider>
              {children}
            </FileSystemProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
