
import type { MetadataRoute } from 'next';

// It's important to set your actual base URL here.
// You can use an environment variable for this.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com'; // Replace with your actual app URL or set NEXT_PUBLIC_APP_URL

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly', // 'always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'
      priority: 1.0, // Priority from 0.0 to 1.0
    },
    // Add other static public pages here if your app has them
    // For example, if you have an /about page:
    // {
    //   url: `${APP_URL}/about`,
    //   lastModified: new Date(),
    //   changeFrequency: 'yearly',
    //   priority: 0.8,
    // },
    // If you have dynamic pages, you'll need to generate them programmatically.
  ];
}
