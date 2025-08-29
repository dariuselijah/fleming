import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/callback', '/c/'],
    },
    sitemap: 'https://askfleming.perkily.io/sitemap.xml',
  }
} 