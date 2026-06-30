"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { 
  Lock, 
  Loader2, 
  Settings, 
  KeyRound,
  LogOut,
  Phone
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function TenantSettings() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ name: string; phone: string } | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error("Vui lòng điền đầy đủ các thông tin");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Mật khẩu mới phải từ 6 ký tự trở lên");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Xác nhận mật khẩu mới không chính xác");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/tenant/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      toast.success("Thay đổi mật khẩu thành công");
      
      // Reset form fields
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Lỗi thay đổi mật khẩu");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-2 border-b pb-2 mb-4">
        <Settings className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-primary">Tài khoản & Cá nhân</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div className="md:col-span-1 space-y-4">
          {/* User profile card */}
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 font-extrabold text-xl border border-primary/20">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base leading-snug truncate">{currentUser.name}</h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Phone className="w-3.5 h-3.5 shrink-0" /> {currentUser.phone}
                </p>
                <span className="inline-block text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full mt-2 uppercase bg-primary/10 text-primary">
                  Khách thuê
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Safety Actions */}
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="w-full h-11 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Đăng xuất tài khoản
          </Button>
        </div>

        <div className="md:col-span-2">
          {/* Change password card */}
          <Card className="rounded-2xl border-none shadow-md overflow-hidden">
            <CardHeader className="bg-muted/10 pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" /> Đổi mật khẩu
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-5">
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="oldPassword">Mật khẩu hiện tại *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="oldPassword"
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="pl-9 h-11"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">Mật khẩu mới *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-9 h-11"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9 h-11"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 text-base font-bold shadow-md shadow-primary/20 bg-gradient-to-r from-primary-gradient-start to-primary-gradient-end mt-4 rounded-xl"
                >
                  {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  Cập nhật mật khẩu
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
