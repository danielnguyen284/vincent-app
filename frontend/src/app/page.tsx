"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { hasAnyRole, hasRole } from "@/lib/roles";


export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.replace("/login");
      return;
    }

    const user = JSON.parse(userStr);
    if (hasAnyRole(user, ["ADMIN", "OWNER", "MANAGER"])) {
      router.replace("/dashboard");
    } else if (hasRole(user, "TECHNICIAN")) {
      router.replace("/tickets");
    } else if (hasRole(user, "TENANT")) {
      router.replace("/tenant/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <svg width={40} height={40} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
        <defs>
          <linearGradient id="homeLogo" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <path d="M15,15 L32,15 L50,60 L68,15 L85,15 L50,90 Z" fill="url(#homeLogo)" />
        <path d="M50,22 L37,34 L41,34 L41,52 L59,52 L59,34 L63,34 Z M47,42 L53,42 L53,48 L47,48 Z" fill="url(#homeLogo)" fillRule="evenodd" />
      </svg>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </main>
  );
}
