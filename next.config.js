/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
  images: {
    domains: ['localhost', 'getfirmflow.com'],
    unoptimized: process.env.NODE_ENV === 'development',
  },
}

module.exports = nextConfig
