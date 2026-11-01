import type { MetadataRoute } from "next";

// Served publicly at /manifest.webmanifest (not matched by proxy.ts).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "My AI Assistant",
    short_name: "Assistant",
    description: "Personal AI assistant",
    lang: "en",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    categories: ["productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
