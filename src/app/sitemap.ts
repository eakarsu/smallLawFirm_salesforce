import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://getfirmflow.com'; const lastModified = new Date()
  return ['', '/features', '/integrations', '/security', '/contact', '/privacy', '/terms'].map((path) => ({ url: `${base}${path}`, lastModified, changeFrequency: 'monthly' as const, priority: path === '' ? 1 : 0.6 }))
}
