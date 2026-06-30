"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Pencil,
  Trash2,
  Loader2,
  Shield,
  Building2,
  ClipboardList,
  Wrench,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  KeyRound,
  Lock,
  Unlock,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { User } from "@/lib/types";
import { UserRole, getUserRoles, hasRole } from "@/lib/roles";
import { toast } from "sonner";

const ROLE_CONFIG = {
  ADMIN: { label: "Admin", variant: "default" as const, icon: Shield },
  OWNER: { label: "Chủ nhà", variant: "secondary" as const, icon: Building2 },
  MANAGER: { label: "Quản lý", variant: "outline" as const, icon: ClipboardList },
  TECHNICIAN: { label: "Kỹ thuật", variant: "outline" as const, icon: Wrench },
};
const ASSIGNABLE_ROLES: UserRole[] = ["OWNER", "MANAGER", "TECHNICIAN"];

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("system");

  // Form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRoles, setFormRoles] = useState<UserRole[]>(["OWNER"]);
  const [formPaymentQrCode, setFormPaymentQrCode] = useState<string | undefined>(undefined);
  const [showPassword, setShowPassword] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const [systemData, tenantData] = await Promise.all([
        apiFetch<User[]>("/api/users"),
        apiFetch<any[]>("/api/users?role=TENANT"),
      ]);
      setUsers(systemData);
      setTenantUsers(tenantData);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormPassword("");
    setFormRoles(["OWNER"]);
    setFormPaymentQrCode(undefined);
    setShowPassword(false);
    setEditingUser(null);
    setError("");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormPhone(user.phone);
    setFormPassword("");
    setFormRoles(getUserRoles(user).filter((role) => role !== "ADMIN"));
    setFormPaymentQrCode(user.payment_qr_code);
    setShowPassword(false);
    setError("");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFormLoading(true);

    try {
      if (editingUser) {
        const body: Record<string, string | UserRole[]> = { name: formName, phone: formPhone, roles: formRoles };
        if (formPassword) body.password = formPassword;
        if (formRoles.includes("OWNER") && formPaymentQrCode) body.payment_qr_code = formPaymentQrCode;
        if (formRoles.includes("OWNER") && !formPaymentQrCode) body.payment_qr_code = "";

        await apiFetch(`/api/users/${editingUser.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Cập nhật người dùng thành công");
      } else {
        const body: Record<string, string | UserRole[]> = {
          name: formName,
          phone: formPhone,
          password: formPassword,
          roles: formRoles,
        };
        if (formRoles.includes("OWNER") && formPaymentQrCode) body.payment_qr_code = formPaymentQrCode;

        await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Tạo người dùng thành công");
      }
      setDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Bạn có chắc muốn xóa người dùng "${user.name}"?`)) return;
    try {
      await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
      toast.success("Xóa người dùng thành công");
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi xóa người dùng");
    }
  };

  const handleResetTenantPassword = async (tenant: any) => {
    if (!confirm(`Bạn có chắc muốn đặt lại mật khẩu của khách thuê "${tenant.name}" về mặc định "88888888"?`)) return;
    try {
      await apiFetch(`/api/users/${tenant.id}/reset-password`, {
        method: "POST"
      });
      toast.success("Đặt lại mật khẩu khách thuê thành công");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi đặt lại mật khẩu");
    }
  };

  const handleToggleTenantStatus = async (tenant: any) => {
    const actionStr = tenant.is_active ? "khóa" : "mở khóa";
    if (!confirm(`Bạn có chắc muốn ${actionStr} tài khoản khách thuê "${tenant.name}"?`)) return;
    try {
      await apiFetch(`/api/users/${tenant.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !tenant.is_active })
      });
      toast.success(`${tenant.is_active ? "Khóa" : "Mở khóa"} tài khoản thành công`);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật trạng thái");
    }
  };

  // Pagination and filtering helpers
  const activeList = activeTab === "system" ? users : tenantUsers;
  const totalPages = Math.ceil(activeList.length / itemsPerPage);
  const currentUsers = activeList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setCurrentPage(1);
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto md:space-y-6 pb-24 md:pb-0 space-y-4">
      <div className="flex items-center justify-between mb-4 md:mb-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Người dùng</h1>
          <p className="text-muted-foreground text-sm">
            Quản lý tài khoản và phân quyền hệ thống
          </p>
        </div>
        {activeTab === "system" && (
          <Button className="hidden md:flex" onClick={openCreate}>
            <UserPlus className="mr-2 h-4 w-4" />
            Tạo tài khoản
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-sm bg-muted/65 p-1 rounded-xl mb-4">
          <TabsTrigger value="system" className="rounded-lg font-semibold text-sm">Tài khoản hệ thống</TabsTrigger>
          <TabsTrigger value="tenant" className="rounded-lg font-semibold text-sm">Tài khoản khách thuê</TabsTrigger>
        </TabsList>

        {/* SYSTEM ACCOUNTS TAB CONTENT */}
        <TabsContent value="system" className="space-y-4">
          <div className="border rounded-lg bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Không tìm thấy tài khoản hệ thống nào
                    </TableCell>
                  </TableRow>
                ) : (
                  currentUsers.map((user) => {
                    const roles = getUserRoles(user);
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {roles.map((role) => {
                              const cfg = ROLE_CONFIG[role];
                              if (!cfg) return null;
                              const Icon = cfg.icon;
                              return (
                                <Badge key={role} variant={cfg.variant} className="gap-1">
                                  <Icon className="h-3 w-3" />
                                  {cfg.label}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(user)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {!hasRole(user, "ADMIN") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(user)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TENANT ACCOUNTS TAB CONTENT */}
        <TabsContent value="tenant" className="space-y-4">
          <div className="border rounded-lg bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Số điện thoại</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Không tìm thấy tài khoản khách thuê nào
                    </TableCell>
                  </TableRow>
                ) : (
                  currentUsers.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell>{tenant.phone}</TableCell>
                      <TableCell>
                        {tenant.is_active ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 gap-1 font-semibold">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Hoạt động
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 gap-1 font-semibold">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> Bị khóa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Đặt lại mật khẩu"
                            onClick={() => handleResetTenantPassword(tenant)}
                          >
                            <KeyRound className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={tenant.is_active ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                            onClick={() => handleToggleTenantStatus(tenant)}
                          >
                            {tenant.is_active ? (
                              <Lock className="h-4 w-4 text-rose-600" />
                            ) : (
                              <Unlock className="h-4 w-4 text-emerald-600" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* CREATE DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Chỉnh sửa người dùng" : "Tạo tài khoản mới"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="form-name">Họ tên</Label>
              <Input
                id="form-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-phone">Số điện thoại</Label>
              <Input
                id="form-phone"
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-password">
                {editingUser ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu"}
              </Label>
              <div className="relative">
                <Input
                  id="form-password"
                  type={showPassword ? "text" : "password"}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required={!editingUser}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Vai trò</Label>
              <div className="grid gap-2 rounded-md border p-3">
                {ASSIGNABLE_ROLES.map((role) => {
                  const cfg = ROLE_CONFIG[role];
                  const checked = formRoles.includes(role);
                  return (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={hasRole(editingUser, "ADMIN") || (checked && formRoles.length === 1)}
                        checked={checked}
                        onChange={(event) => {
                          setFormRoles((current) => {
                            if (event.target.checked) return Array.from(new Set([...current, role]));
                            return current.filter((item) => item !== role);
                          });
                        }}
                      />
                      <span>{cfg.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {formRoles.includes("OWNER") && (
              <div className="space-y-2">
                <Label>Mã QR Thanh toán</Label>
                {formPaymentQrCode ? (
                  <div className="relative inline-block border border-gray-200 rounded-lg p-2 mt-2">
                    <img src={formPaymentQrCode} alt="QR Code" className="max-h-32 object-contain" />
                    <button 
                      type="button"
                      onClick={() => setFormPaymentQrCode(undefined)}
                      className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 hover:bg-red-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input 
                      type="file" 
                      id="upload-qr-user" 
                      className="hidden" 
                      accept="image/*"
                      onChange={async (e) => {
                        if (!e.target.files || e.target.files.length === 0) return;
                        const file = e.target.files[0];
                        const reader = new FileReader();
                        reader.onload = async () => {
                          try {
                            setFormLoading(true);
                            const res = await apiFetch<{url: string}>("/api/upload", {
                              method: "POST",
                              body: JSON.stringify({ image: reader.result as string })
                            });
                            setFormPaymentQrCode(res.url);
                          } catch (err) {
                            alert("Lỗi tải ảnh lên");
                          } finally {
                            setFormLoading(false);
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <label htmlFor="upload-qr-user" className="cursor-pointer inline-flex items-center justify-center w-full h-10 px-4 mt-2 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                      <Upload className="w-4 h-4 mr-2" />
                      Tải ảnh QR lên
                    </label>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={formLoading}>
              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingUser ? "Cập nhật" : "Tạo tài khoản"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Hiển thị {((currentPage - 1) * itemsPerPage) + 1} đến {Math.min(currentPage * itemsPerPage, activeList.length)} trong tổng số {activeList.length} người dùng
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Trước
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <Button
                  key={i}
                  variant={currentPage === i + 1 ? "default" : "outline"}
                  size="sm"
                  className="w-8 h-8 p-0"
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Sau <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Mobile Fixed Bottom Actions */}
      {activeTab === "system" && (
        <div className="fixed bottom-0 left-0 w-full p-4 bg-background border-t md:hidden z-20">
          <Button className="w-full rounded-xl py-6 text-base font-semibold" onClick={openCreate}>
            Tạo tài khoản
          </Button>
        </div>
      )}
    </div>
  );
}
