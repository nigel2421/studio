/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@genkit-ai/core',
    '@genkit-ai/firebase',
    '@genkit-ai/google-genai',
    'genkit',
    'dotprompt',
    'yaml',
    'jsonpath-plus',
  ],
  allowedDevOrigins: ["https://*.cloudworkstations.dev"],
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
