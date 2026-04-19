import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bilingual Chat",
    short_name: "BilingualChat",
    description: "KO-RU bilingual chat",
    start_url: "/",
    display: "standalone",
    background_color: "#f0f2f5",
    theme_color: "#0077ff",
    lang: "ru",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
