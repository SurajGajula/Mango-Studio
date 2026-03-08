/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    const existingNoParse = config.module.noParse
    config.module.noParse = (resource) => {
      if (resource.includes('essentia-wasm.umd.js')) return true
      if (typeof existingNoParse === 'function') return existingNoParse(resource)
      if (existingNoParse instanceof RegExp) return existingNoParse.test(resource)
      return false
    }
    return config
  },
  turbopack: {
    resolveAlias: {
      'essentia.js': './app/lib/essentia-stub.js',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
