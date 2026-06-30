import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vincent Management System",
    short_name: "Vincent",
    description: "Hệ thống quản lý nhà trọ và căn hộ dịch vụ",
    start_url: "/",
    display: "standalone",
    background_color: "#14452F",
    theme_color: "#14452F",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
