const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Resolve anchor IDLs from workspace target directory
    config.resolve.alias["@idl"] = path.resolve(__dirname, "../target/idl");
    // Required for @solana/wallet-adapter and @coral-xyz/anchor in Next.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;
