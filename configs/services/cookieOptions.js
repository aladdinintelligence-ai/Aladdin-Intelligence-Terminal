const isProd = process.env.NODE_ENV === "production";

export const authCookieOptions = {
  httpOnly: true,
  secure: isProd,                    // HTTPS only in prod
  sameSite: isProd ? "none" : "lax", // cross-site in prod
  domain: isProd ? ".nestfunded.pro" : undefined,
//   maxAge: 15 * 24 * 60 * 60 * 1000,  
  maxAge: 24 * 60 * 60 * 1000,
};
