"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { 
  Wrench, 
  Plus, 
  ArrowLeft, 
  Camera, 
  X, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Image as ImageIcon
} from "lucide-react";
import { toast } from "sonner";

interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  evidence_photos: string[];
  created_at: string;
}

export default function TenantTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "create">("list");
  
  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Ticket[]>("/api/tenant/tickets");
      setTickets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (photos.length + files.length > 5) {
      toast.error("Chỉ được tải tối đa 5 ảnh bằng chứng");
      return;
    }

    setUploading(true);
    const newPhotos = [...photos];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const res = await apiFetch<{ url: string }>("/api/upload", {
          method: "POST",
          body: JSON.stringify({ image: base64 })
        });
        
        newPhotos.push(res.url);
      }
      setPhotos(newPhotos);
    } catch (err) {
      toast.error("Lỗi tải ảnh lên");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    setPhotos(newPhotos);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Vui lòng nhập tiêu đề yêu cầu");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/tenant/tickets", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          priority,
          evidence_photos: photos
        })
      });
      toast.success("Gửi yêu cầu sửa chữa thành công");
      
      // Reset form
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setPhotos([]);
      setView("list");
      fetchTickets();
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> Đã hoàn thành
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
            <Clock className="w-3 h-3 animate-spin" /> Đang sửa chữa
          </span>
        );
      case "PENDING":
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            <Clock className="w-3 h-3" /> Chờ xử lý
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-400">
            {status}
          </span>
        );
    }
  };

  const getPriorityLabel = (pri: string) => {
    switch (pri) {
      case "URGENT":
        return <span className="text-rose-600 dark:text-rose-400 font-extrabold">Khẩn cấp</span>;
      case "HIGH":
        return <span className="text-orange-600 dark:text-orange-400 font-bold">Cao</span>;
      case "MEDIUM":
        return <span className="text-slate-700 dark:text-slate-300 font-medium">Trung bình</span>;
      default:
        return <span className="text-slate-400 font-normal">Thấp</span>;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN") + " " + date.toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit' });
  };

  if (loading && tickets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {view === "list" ? (
        <>
          <div className="flex items-center justify-between border-b pb-2 mb-4">
            <h1 className="text-xl font-bold text-primary flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" /> Yêu cầu sửa chữa
            </h1>
            <Button 
              size="sm" 
              onClick={() => setView("create")}
              className="rounded-xl bg-gradient-to-r from-primary-gradient-start to-primary-gradient-end"
            >
              <Plus className="w-4 h-4 mr-1" /> Gửi yêu cầu
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {tickets.length === 0 ? (
            <div className="text-center py-12 bg-background rounded-2xl shadow-sm text-muted-foreground">
              <Wrench className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-semibold text-sm">Phòng bạn chưa gửi yêu cầu sửa chữa nào</p>
              <p className="text-xs text-muted-foreground/80 mt-1">Bấm nút "Gửi yêu cầu" ở trên để báo hỏng hóc, sửa chữa.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tickets.map((ticket) => (
                <Card key={ticket.id} className="rounded-2xl border-none shadow-sm overflow-hidden">
                  <CardHeader className="bg-muted/10 pb-3 flex flex-row items-start justify-between">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase block mb-1">
                        Ngày tạo: {formatDate(ticket.created_at)}
                      </span>
                      <CardTitle className="text-sm font-bold leading-tight">{ticket.title}</CardTitle>
                    </div>
                    {getStatusBadge(ticket.status)}
                  </CardHeader>
                  <CardContent className="pt-3 space-y-2.5 text-sm">
                    {ticket.description && (
                      <p className="text-muted-foreground text-xs leading-relaxed">{ticket.description}</p>
                    )}
                    
                    <div className="flex justify-between items-center text-xs pt-1.5 border-t border-dashed">
                      <span className="text-muted-foreground">Mức độ ưu tiên:</span>
                      {getPriorityLabel(ticket.priority)}
                    </div>

                    {ticket.evidence_photos && ticket.evidence_photos.length > 0 && (
                      <div className="pt-2">
                        <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1 font-semibold">
                          <ImageIcon className="w-3 h-3" /> Hình ảnh đính kèm:
                        </p>
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          {ticket.evidence_photos.map((url, imgIdx) => (
                            <div key={imgIdx} className="w-12 h-12 rounded-lg border overflow-hidden shrink-0 bg-muted">
                              <img src={url} alt="Evidence" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b pb-2 mb-4">
            <Button variant="ghost" size="icon" onClick={() => setView("list")} className="rounded-full w-9 h-9">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Button>
            <h1 className="text-xl font-bold text-primary">Tạo yêu cầu mới</h1>
          </div>

          <Card className="max-w-2xl mx-auto rounded-2xl border-none shadow-md overflow-hidden">
            <CardContent className="p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Tiêu đề yêu cầu *</Label>
                  <Input 
                    id="title"
                    placeholder="VD: Bóng đèn nhà vệ sinh bị cháy, Hỏng vòi sen..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Mô tả tình trạng</Label>
                  <Textarea 
                    id="description"
                    placeholder="Vui lòng cung cấp thêm thông tin chi tiết (nếu có)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="priority" className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Mức độ ưu tiên *</Label>
                  <Select value={priority} onValueChange={(val) => setPriority(val)}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Chọn mức độ ưu tiên" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Thấp (Có thể xử lý chậm)</SelectItem>
                      <SelectItem value="MEDIUM">Trung bình</SelectItem>
                      <SelectItem value="HIGH">Cao (Cần khắc phục nhanh)</SelectItem>
                      <SelectItem value="URGENT">Khẩn cấp (Hỏng hóc nghiêm trọng)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block">Ảnh minh họa (Tối đa 5 ảnh)</Label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleUploadPhoto}
                  />
                  
                  {uploading && <p className="text-xs text-muted-foreground">Đang tải ảnh lên...</p>}
                  
                  {photos.length > 0 ? (
                    <div className="grid grid-cols-5 gap-2">
                      {photos.map((url, idx) => (
                        <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border bg-muted">
                          <img src={url} alt="Upload" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="absolute top-1 right-1 bg-black/60 text-white p-0.5 rounded-full"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div 
                      className="border-2 border-dashed border-muted-foreground/20 rounded-xl p-6 flex flex-col items-center justify-center text-muted-foreground bg-muted/5 cursor-pointer hover:bg-muted/10 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="w-6 h-6 mb-1 opacity-50 text-primary" />
                      <span className="text-[11px] font-semibold">Tải ảnh chụp lỗi thiết bị</span>
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  disabled={submitting || !title.trim()} 
                  className="w-full h-11 text-base font-bold shadow-md shadow-primary/20 bg-gradient-to-r from-primary-gradient-start to-primary-gradient-end mt-4 rounded-xl"
                >
                  {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  Gửi yêu cầu sửa chữa
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
