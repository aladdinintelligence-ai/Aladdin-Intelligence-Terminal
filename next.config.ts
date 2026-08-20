import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = { outputFileTracingRoot: path.resolve(process.cwd()), allowedDevOrigins: ["http://local.aladdin.dev"] };
export default nextConfig;