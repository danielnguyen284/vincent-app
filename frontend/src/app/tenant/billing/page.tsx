"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { 
  Receipt, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Loader2,
  Zap,
  Droplet
} from "lucide-react";

interface InvoiceItem {
  id: string;
  fee_id: string | null;
  description: string;
  amount: number | string;
}

interface Invoice {
  id: string;
  billing_period: string;
  issue_date: string;
  rent_amount: number | string;
  rolling_balance: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  status: "UNPAID" | "PARTIAL" | "PAID";
  items: InvoiceItem[];
  room?: {
    id: string;
    name: string;
    floor?: {
      name: string;
      building?: {
        name: string;
        address: string;
        payment_qr_code?: string;
      }
    }
  };
}

export default function TenantBilling() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const data = await apiFetch<Invoice[]>("/api/tenant/invoices");
        setInvoices(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã xảy ra lỗi");
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);
  };

  const formatPeriod = (periodStr: string) => {
    if (!periodStr) return "";
    const [year, month] = periodStr.split("-");
    return `Tháng ${month}/${year}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN");
  };

  const toggleExpand = (id: string) => {
    setExpandedInvoiceId(expandedInvoiceId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-destructive gap-2 text-center px-4">
        <AlertCircle className="h-12 w-12" />
        <p className="font-semibold text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between border-b pb-2 mb-4">
        <h1 className="text-xl font-bold text-primary flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" /> Lịch sử hóa đơn
        </h1>
        <span className="text-xs text-muted-foreground font-medium">
          Tổng số: {invoices.length}
        </span>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-12 bg-background rounded-2xl shadow-sm text-muted-foreground">
          <Receipt className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-sm">Chưa có hóa đơn nào được phát hành</p>
          <p className="text-xs text-muted-foreground/80 mt-1">Khi quản lý phát hành hóa đơn mới, bạn sẽ thấy ở đây.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => {
            const isExpanded = expandedInvoiceId === invoice.id;
            const isPaid = invoice.status === "PAID";
            
            // Build items to display
            const displayItems = [...(invoice.items || [])];
            
            const hasRentInItems = displayItems.some(it => 
              it.description.toLowerCase().includes("phòng") ||
              it.description.toLowerCase().includes("thuê")
            );
            
            if (!hasRentInItems && Number(invoice.rent_amount) > 0) {
              displayItems.push({
                id: "base-rent",
                fee_id: null,
                description: "Tiền thuê phòng",
                amount: Number(invoice.rent_amount)
              });
            }

            const SORT_ORDER = [
              "phòng",
              "điện",
              "nước",
              "internet", "mạng", "wifi",
              "dịch vụ",
              "giặt",
              "công nợ", "dự nợ", "dư kỳ"
            ];

            const getSortPriority = (description: string) => {
              const desc = description.toLowerCase();
              for (let i = 0; i < SORT_ORDER.length; i++) {
                if (desc.includes(SORT_ORDER[i])) return i;
              }
              return 999;
            };

            const sortedItems = displayItems.sort(
              (a, b) => getSortPriority(a.description) - getSortPriority(b.description)
            );

            return (
              <Card 
                key={invoice.id} 
                className={`rounded-2xl border-none shadow-sm transition-all duration-300 overflow-hidden ${
                  isExpanded ? "ring-1 ring-primary/20 shadow-md" : ""
                }`}
              >
                <div 
                  onClick={() => toggleExpand(invoice.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-full shrink-0 ${
                      isPaid 
                        ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400" 
                        : invoice.status === "PARTIAL"
                          ? "bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400"
                          : "bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                    }`}>
                      {isPaid ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{formatPeriod(invoice.billing_period)}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Phòng {invoice.room?.name} • Ngày lập: {formatDate(invoice.issue_date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <div>
                      <p className={`font-extrabold text-sm ${isPaid ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-rose-600 dark:text-rose-400"}`}>
                        {formatCurrency(Number(invoice.total_amount))}
                      </p>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                        isPaid 
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" 
                          : invoice.status === "PARTIAL"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                      }`}>
                        {isPaid ? "Đã thanh toán" : invoice.status === "PARTIAL" ? "Đóng một phần" : "Chưa thanh toán"}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="border-t bg-muted/5 p-4 space-y-4 text-sm">
                    {/* Invoice detail items */}
                    <div className="space-y-2.5">
                      <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-2">Chi tiết hóa đơn</h4>
                      
                      {sortedItems.map((item, idx) => {
                        const isPower = item.description.toLowerCase().includes("điện");
                        const isWater = item.description.toLowerCase().includes("nước");
                        const Icon = isPower ? Zap : isWater ? Droplet : null;
                        
                        return (
                          <div key={idx} className="flex justify-between items-start py-1.5 border-b border-dashed last:border-0 border-muted/30">
                            <div className="flex items-center gap-1.5">
                              {Icon && <Icon className="w-3.5 h-3.5 text-primary shrink-0" />}
                              <span>{item.description}</span>
                            </div>
                            <span className="font-semibold">{formatCurrency(Number(item.amount))}</span>
                          </div>
                        );
                      })}

                      {/* Tổng thanh toán */}
                      <div className="flex justify-between items-center pt-3 border-t font-bold text-base">
                        <span>Tổng hóa đơn</span>
                        <span className="text-primary">{formatCurrency(Number(invoice.total_amount))}</span>
                      </div>

                      {Number(invoice.paid_amount) > 0 && (
                        <div className="flex justify-between items-center py-1 text-xs text-muted-foreground">
                          <span>Đã đóng trước đó</span>
                          <span className="text-emerald-600 font-medium">-{formatCurrency(Number(invoice.paid_amount))}</span>
                        </div>
                      )}

                      {Number(invoice.total_amount) - Number(invoice.paid_amount) > 0 && (
                        <div className="flex justify-between items-center py-1 font-bold text-sm text-rose-600 border-t border-dashed">
                          <span>Còn lại cần đóng</span>
                          <span>{formatCurrency(Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount)))}</span>
                        </div>
                      )}
                    </div>

                    {/* Payment Info */}
                    {!isPaid && (
                      <div className="bg-primary/5 rounded-xl p-3 border border-primary/10 mt-2">
                        <p className="text-xs font-bold text-primary uppercase tracking-wide">Hướng dẫn đóng tiền</p>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          Chuyển khoản theo mã QR hiển thị ở trang chủ (phòng của tôi) hoặc liên hệ trực tiếp Quản lý tòa nhà để xác nhận thanh toán.
                        </p>
                      </div>
                    )}

                    {isPaid && (
                      <div className="bg-emerald-500/5 text-emerald-600 rounded-xl p-3 border border-emerald-500/10 text-xs mt-2">
                        <span className="font-semibold">Xác nhận thanh toán:</span> Đã nhận đủ tiền.
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
