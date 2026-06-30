"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { Home, Users, FileText, QrCode, Phone, Landmark, AlertCircle, Loader2 } from "lucide-react";

interface TenancyDetails {
  id: string;
  name: string;
  cccd: string;
  phone: string;
  is_representative: boolean;
  room: {
    id: string;
    name: string;
    base_rent: number;
    floor: string;
    building: string;
    address: string;
    payment_qr_code?: string;
  };
  contract: {
    id: string;
    start_date: string;
    end_date: string;
    rent_amount: number;
    deposit_amount: number;
    status: string;
    document_photos?: string[];
    representative_tenant?: {
      name: string;
      phone: string;
    };
  } | null;
  roommates: Array<{
    name: string;
    phone: string;
    is_representative: boolean;
  }>;
}

export default function TenantDashboard() {
  const [tenancies, setTenancies] = useState<TenancyDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const data = await apiFetch<TenancyDetails[]>("/api/tenant/dashboard");
        setTenancies(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã xảy ra lỗi");
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || tenancies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-destructive gap-2 text-center px-4">
        <AlertCircle className="h-12 w-12" />
        <p className="font-semibold text-lg">{error || "Không tìm thấy thông tin phòng thuê hoạt động"}</p>
        <p className="text-sm text-muted-foreground">Vui lòng liên hệ với Quản lý tòa nhà để kiểm tra lại thông tin hợp đồng của bạn.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {tenancies.map((tenancy) => (
        <div key={tenancy.id} className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Welcome Card */}
          <div className="md:col-span-2 bg-gradient-to-r from-primary-gradient-start to-primary-gradient-end text-primary-foreground p-6 rounded-3xl shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <span className="text-xs font-bold uppercase tracking-wider opacity-85">Chào mừng bạn trở về nhà</span>
              <h1 className="text-2xl font-black mt-1 tracking-tight">{tenancy.name}</h1>
              <p className="text-sm mt-3 opacity-90 font-medium">
                Phòng {tenancy.room.name} • Lầu {tenancy.room.floor}
              </p>
              <p className="text-xs opacity-75 mt-1 font-medium">{tenancy.room.building}</p>
            </div>
            <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10">
              <Home className="w-40 h-40" />
            </div>
          </div>

          {/* Room Details Card */}
          <Card className="rounded-2xl border-none shadow-md overflow-hidden">
            <CardHeader className="bg-muted/10 pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Home className="w-5 h-5 text-primary" /> Thông tin phòng thuê
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="flex justify-between items-center text-sm border-b pb-2.5">
                <span className="text-muted-foreground">Tòa nhà</span>
                <span className="font-semibold text-right">{tenancy.room.building}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b pb-2.5">
                <span className="text-muted-foreground">Địa chỉ</span>
                <span className="font-semibold text-right max-w-[200px] truncate">{tenancy.room.address}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b pb-2.5">
                <span className="text-muted-foreground">Giá thuê cơ bản</span>
                <span className="font-bold text-primary">{formatCurrency(tenancy.room.base_rent)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Vai trò trong phòng</span>
                <span className="font-semibold px-2.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                  {tenancy.is_representative ? "Người đại diện hợp đồng" : "Thành viên phòng"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Contract Card */}
          {tenancy.contract ? (
            <Card className="rounded-2xl border-none shadow-md overflow-hidden">
              <CardHeader className="bg-muted/10 pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" /> Thông tin hợp đồng
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between items-center text-sm border-b pb-2.5">
                  <span className="text-muted-foreground">Thời hạn hợp đồng</span>
                  <span className="font-semibold text-right">
                    {formatDate(tenancy.contract.start_date)} - {formatDate(tenancy.contract.end_date)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm border-b pb-2.5">
                  <span className="text-muted-foreground">Tiền cọc phòng</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(tenancy.contract.deposit_amount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Đại diện ký tên</span>
                  <span className="font-semibold text-right">
                    {tenancy.contract.representative_tenant?.name} ({tenancy.contract.representative_tenant?.phone})
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-none shadow-md overflow-hidden p-6 text-center text-muted-foreground">
              Chưa gán thông tin hợp đồng chính thức.
            </Card>
          )}

          {/* Roommates Card */}
          <Card className="rounded-2xl border-none shadow-md overflow-hidden">
            <CardHeader className="bg-muted/10 pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Thành viên cùng phòng
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              {tenancy.roommates.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Chỉ có bạn trong phòng này.
                </div>
              ) : (
                <div className="divide-y">
                  {tenancy.roommates.map((roommate, idx) => (
                    <div key={idx} className="flex justify-between items-center px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{roommate.name}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {roommate.phone}
                        </span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {roommate.is_representative ? "Đại diện" : "Thành viên"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment QR Code Card */}
          {tenancy.room.payment_qr_code && (
            <Card className="rounded-2xl border-none shadow-md overflow-hidden">
              <CardHeader className="bg-muted/10 pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-primary" /> Thông tin thanh toán QR
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex flex-col items-center justify-center p-6 text-center">
                <p className="text-xs text-muted-foreground mb-4">
                  Quét mã QR dưới đây để thực hiện thanh toán tiền phòng/dịch vụ hàng tháng.
                </p>
                <div className="w-48 h-48 relative border rounded-xl overflow-hidden shadow-sm bg-white p-1">
                  <img
                    src={tenancy.room.payment_qr_code}
                    alt="Payment QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Landmark className="w-4 h-4 text-primary" />
                  <span>Vui lòng điền đúng nội dung thanh toán theo hướng dẫn của hóa đơn</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ))}
    </div>
  );
}
