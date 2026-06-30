"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import Link from "next/link";
import { 
  Home, 
  Receipt, 
  Wrench, 
  Settings, 
  LogOut, 
  Sun, 
  Moon,
  Building2,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasRole } from "@/lib/roles";

const tenantNavItems = [
  { href: "/tenant/dashboard", label: "Phòng của tôi", icon: Home },
  { href: "/tenant/billing", label: "Hóa đơn", icon: Receipt },
  { href: "/tenant/tickets", label: "Sửa chữa", icon: Wrench },
  { href: "/tenant/settings", label: "Cá nhân", icon: Settings },
];

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; role?: string; roles?: string[] } | null>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (!token || !storedUser) {
      router.push("/login");
      return;
    }
    
    try {
      const parsedUser = JSON.parse(storedUser);
      if (!hasRole(parsedUser, "TENANT")) {
        router.push("/login");
        return;
      }
      setUser(parsedUser);
    } catch {
      router.push("/login");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* SIDEBAR FOR IPAD / LAPTOP */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-background sticky top-0 h-screen shrink-0">
        {/* Brand header */}
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Building2 className="h-6 w-6 text-primary shrink-0 animate-pulse" />
          <div className="flex flex-col text-left">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Cổng Khách Thuê</span>
            <span className="text-sm font-extrabold tracking-wide text-primary leading-tight">Vincent Portal</span>
          </div>
        </div>

        {/* User Card */}
        <div className="p-4 border-b bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-full shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-muted-foreground leading-none">Xin chào,</span>
              <span className="text-sm font-bold text-foreground truncate mt-1">{user.name}</span>
            </div>
          </div>
        </div>

        {/* Sidebar Nav Links */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {tenantNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive 
                    ? "bg-primary/10 text-primary font-bold" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer Controls */}
        <div className="p-4 border-t space-y-2">
          {mounted && (
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3 rounded-lg"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-slate-700" />}
              <span>{theme === 'dark' ? "Chế độ sáng" : "Chế độ tối"}</span>
            </Button>
          )}
          <Button 
            variant="outline" 
            className="w-full justify-start gap-3 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-lg border-destructive/20"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            <span>Đăng xuất</span>
          </Button>
        </div>
      </aside>

      {/* RIGHT SIDE / MAIN COLUMN */}
      <div className="flex flex-1 flex-col min-w-0 pb-16 md:pb-0">
        {/* TOP HEADER FOR MOBILE ONLY */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-md px-4 shadow-sm md:hidden shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary shrink-0 animate-pulse" />
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Cổng Khách Thuê</span>
              <span className="text-sm font-extrabold tracking-wide text-primary leading-tight">Vincent Portal</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {mounted && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="rounded-full w-9 h-9"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout} 
              className="text-destructive rounded-full w-9 h-9"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        {/* Responsive widths to fit mobile, tablet, and laptop */}
        <main className="flex-1 w-full max-w-md md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto p-4 md:p-8">
          {children}
        </main>
      </div>

      {/* BOTTOM NAVIGATION FOR MOBILE ONLY */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t bg-background/95 backdrop-blur-md flex items-center justify-around px-2 shadow-lg md:hidden">
        {tenantNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl transition-all ${
                isActive 
                  ? "text-primary scale-105 font-bold" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
