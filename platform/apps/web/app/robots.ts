import type { MetadataRoute } from "next";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://axiomsiam.com").replace(/\/$/, "");

/** /robots.txt: everything but the signed-in and admin pages; points at the sitemap */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/orders", "/checkout", "/auth", "/verify", "/reset-password"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
