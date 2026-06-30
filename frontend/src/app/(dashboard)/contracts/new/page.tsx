"use client";

import { AccompanyingTenant, AccompanyingTenantsSection } from "@/components/AccompanyingTenantsSection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { apiFetch } from "@/lib/api";
import { addMonths, endOfMonth, format, subDays } from "date-fns";
import {
  Camera,
  Download,
  Loader2,
  Upload,
  X,
  ChevronLeft,
  FileText,
  CheckCircle2,
  RefreshCw

} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Building {
  id: string;
  name: string;
  address?: string;
  ward?: string;
  district?: string;
  province?: string;
}

interface Room {
  id: string;
  name: string;
  floor: { name: string };
  status: string;
  base_rent: number;
}

interface Tenant {
  id: string;
  name: string;
  phone: string | null;
  cccd: string | null;
}

function NewContractForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const initialBuildingId = searchParams?.get("building_id") || "";
  const initialRoomId = searchParams?.get("room_id") || "";
  
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [formRooms, setFormRooms] = useState<Room[]>([]);
  const [formTenants, setFormTenants] = useState<Tenant[]>([]);

  const [formLoading, setFormLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isAiExtracted, setIsAiExtracted] = useState(false);
  const [aiMatchedTenant, setAiMatchedTenant] = useState<Tenant | null>(null);
  const [suggestedTenant, setSuggestedTenant] = useState<Tenant | null>(null);

  
  // Form state
  const [formBuildingId, setFormBuildingId] = useState<string>(initialBuildingId);
  const [formRoomId, setFormRoomId] = useState<string>(initialRoomId);
  const [formTenantMode, setFormTenantMode] = useState<"existing" | "new">("existing");
  const [formTenantId, setFormTenantId] = useState<string>("");
  const [formAccompanyingTenants, setFormAccompanyingTenants] = useState<AccompanyingTenant[]>([]);
  const [formNewTenant, setFormNewTenant] = useState({ name: "", phone: "", cccd: "" });
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formAutoRenew, setFormAutoRenew] = useState(false);
  const [formAutoRenewMonths, setFormAutoRenewMonths] = useState<number>(6);
  const [durationMonths, setDurationMonths] = useState<string>("");

  const setDuration = (months: number | string) => {
    const m = Number(months);
    if (!m || m <= 0) {
      setDurationMonths(months.toString());
      return;
    }
    
    if (!formStartDate) {
      toast.error("Vui lòng chọn ngày bắt đầu trước");
      return;
    }
    const start = new Date(formStartDate);
    const targetDate = addMonths(start, m);
    const finalEnd = endOfMonth(subDays(targetDate, 1));
    setFormEndDate(format(finalEnd, "yyyy-MM-dd"));
    setDurationMonths(m.toString());
    setFormAutoRenewMonths(m);
  };
  const [formRent, setFormRent] = useState("");
  const [formDeposit, setFormDeposit] = useState("");
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const activeStreamRef = useRef<MediaStream | null>(null);

  const formatCurrency = (val: string) => {
    const num = val.toString().replace(/\D/g, "");
    if (!num) return "";
    return parseInt(num, 10).toLocaleString("vi-VN");
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `chung-tu-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  useEffect(() => {
    fetchBuildings();
  }, []);

  useEffect(() => {
    if (formBuildingId) {
      fetchRooms(formBuildingId, setFormRooms);
    } else {
      setFormRooms([]);
      setFormRoomId("");
    }
  }, [formBuildingId]);
  useEffect(() => {
    if (formRoomId) {
      const selectedRoom = formRooms.find(r => r.id === formRoomId);
      if (selectedRoom) {
        if (selectedRoom.status === 'OCCUPIED') {
          toast.error("Phòng này hiện đang có hợp đồng hoạt động. Vui lòng chọn phòng khác.");
          setFormRoomId("");
          return;
        }
        fetchTenants(formRoomId, setFormTenants, aiMatchedTenant || undefined);
        if (!isAiExtracted) {
          setFormRent(selectedRoom.base_rent.toString());
          setFormDeposit(selectedRoom.base_rent.toString());
        }
      }
    } else {
      setFormTenants([]);
      if (!isAiExtracted) {
        setFormTenantId("");
        setFormAccompanyingTenants([]);
        setFormRent("");
        setFormDeposit("");
      }
    }
  }, [formRoomId, formRooms, isAiExtracted, aiMatchedTenant]);

  const fetchBuildings = async () => {
    try {
      const res = await apiFetch<{data: Building[]}>("/api/buildings?limit=1000");
      setBuildings(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRooms = async (buildingId: string, setter: (rooms: Room[]) => void) => {
    try {
      const res = await apiFetch<{data: Room[]}>(`/api/rooms?building_id=${buildingId}&limit=1000`);
      setter(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTenants = async (roomId: string, setter: (tenants: Tenant[]) => void, matchedTenant?: Tenant) => {
    try {
      const data = await apiFetch<Tenant[]>(`/api/rooms/${roomId}/tenants`);
      if (matchedTenant) {
        const exists = data.some(t => t.id === matchedTenant.id);
        if (!exists) {
          data.push(matchedTenant);
        }
      }
      setter(data);
    } catch (err) {
      console.error(err);
    }
  };

  const processBase64Images = async (base64List: string[]) => {
    setAnalyzing(true);
    setFormLoading(true);
    setSuggestedTenant(null);
    try {
      const uploadPromises = base64List.map(base64 => 
        apiFetch<{url: string}>("/api/upload", {
          method: "POST",
          body: JSON.stringify({ image: base64 })
        })
      );

      // 1. Run AI analysis
      let aiResult: any = null;
      try {
        aiResult = await apiFetch<any>("/api/contracts/analyze", {
          method: "POST",
          body: JSON.stringify({ images: base64List })
        });
      } catch (aiErr) {
        console.error("AI Analysis error:", aiErr);
        toast.error("Không thể phân tích hợp đồng bằng AI. Bạn vui lòng tự điền tay các thông tin.");
      }

      // 2. Wait for image uploads to complete
      const uploadResults = await Promise.all(uploadPromises);
      const newUrls = uploadResults.map(res => res.url);
      setFormPhotos(prev => [...prev, ...newUrls]);

      // 3. Populate AI extracted fields
      if (aiResult) {
        setIsAiExtracted(true);
        const { extracted, representative_tenant_match, accompanying_tenants_matches, matched_building_id, matched_room_id } = aiResult;
        
        if (extracted) {
          if (extracted.start_date) setFormStartDate(extracted.start_date);
          if (extracted.end_date) setFormEndDate(extracted.end_date);
          if (extracted.rent_amount) setFormRent(extracted.rent_amount.toString());
          if (extracted.deposit_amount) setFormDeposit(extracted.deposit_amount.toString());
          if (extracted.auto_renew_months) {
            setFormAutoRenew(true);
            setFormAutoRenewMonths(Number(extracted.auto_renew_months));
          }

          if (extracted.start_date && extracted.end_date) {
            const start = new Date(extracted.start_date);
            const end = new Date(extracted.end_date);
            const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
            if (diffMonths > 0) {
              setDurationMonths(diffMonths.toString());
            }
          }

          // Representative tenant prefill
          if (extracted.representative_tenant) {
            setFormTenantMode("new");
            setFormNewTenant({
              name: extracted.representative_tenant.name || "",
              phone: extracted.representative_tenant.phone || "",
              cccd: extracted.representative_tenant.cccd || ""
            });

            if (representative_tenant_match && representative_tenant_match.is_existing) {
              const matchedTenant = {
                id: representative_tenant_match.id,
                name: representative_tenant_match.name,
                phone: representative_tenant_match.phone,
                cccd: representative_tenant_match.cccd
              };
              setSuggestedTenant(matchedTenant);
              toast.success(`Tìm thấy khách cũ trùng khớp: ${representative_tenant_match.name}`);
            }
          }

          // Accompanying tenants prefill
          if (accompanying_tenants_matches && accompanying_tenants_matches.length > 0) {
            const accompanyingList = accompanying_tenants_matches.map((item: any) => {
              if (item.match) {
                return {
                  id: item.match.id,
                  mode: "existing" as const,
                  name: item.match.name,
                  phone: item.match.phone || "",
                  cccd: item.match.cccd || ""
                };
              } else {
                return {
                  mode: "new" as const,
                  name: item.extracted?.name || "",
                  phone: item.extracted?.phone || "",
                  cccd: item.extracted?.cccd || ""
                };
              }
            });
            setFormAccompanyingTenants(accompanyingList);
          }
        }

        // Set matched building and room
        if (matched_building_id) {
          setFormBuildingId(matched_building_id);
          
          if (matched_room_id) {
            try {
              const res = await apiFetch<{data: Room[]}>(`/api/rooms?building_id=${matched_building_id}&limit=1000`);
              setFormRooms(res.data);
              
              const targetRoom = res.data.find(r => r.id === matched_room_id);
              if (targetRoom) {
                if (targetRoom.status === 'OCCUPIED') {
                  toast.error(`Phòng ${targetRoom.name} hiện đang có hợp đồng hoạt động.`);
                } else {
                  setFormRoomId(matched_room_id);
                  toast.success(`Đã tự động chọn phòng: ${targetRoom.name}`);
                }
              }
            } catch (err) {
              console.error("Error pre-fetching rooms:", err);
              setFormRoomId(matched_room_id);
            }
          }
        }

        toast.success("AI đã tự động trích xuất thông tin hợp đồng thành công!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi trong quá trình tải tài liệu hoặc phân tích hợp đồng.");
    } finally {
      setAnalyzing(false);
      setFormLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const compressImage = async (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const maxDim = 1600;
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.7)); // 0.7 quality to save bandwidth
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };

  const handleAnalyzeAndUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    try {
      const base64List: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const compressed = await compressImage(base64);
        base64List.push(compressed);
      }
      await processBase64Images(base64List);
    } catch (err) {
      console.error("Error reading file:", err);
      toast.error("Không thể đọc file ảnh.");
    }
  };

  const isMobileDevice = () => {
    if (typeof window === "undefined") return false;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  };

  const startCamera = async (deviceId?: string) => {
    try {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } 
          : { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === "videoinput");
      setCameraDevices(videoDevices);
      if (!deviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error("Error opening camera:", err);
      toast.error("Không thể mở camera. Vui lòng kiểm tra quyền truy cập camera.");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleCameraCapture = () => {
    if (isMobileDevice()) {
      cameraInputRef.current?.click();
    } else {
      setIsCameraOpen(true);
      startCamera();
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Use actual video dimensions
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    
    const context = canvas.getContext("2d");
    if (!context) return;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawBase64 = canvas.toDataURL("image/jpeg", 0.95);
    
    stopCamera();
    setIsCameraOpen(false);
    
    const compressedBase64 = await compressImage(rawBase64);
    processBase64Images([compressedBase64]);
  };

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    startCamera(deviceId);
  };


  const removePhoto = (index: number) => {
    const newPhotos = [...formPhotos];
    newPhotos.splice(index, 1);
    setFormPhotos(newPhotos);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRoomId) {
      alert("Vui lòng chọn phòng"); return;
    }
    if (formTenantMode === "existing" && !formTenantId) {
      alert("Vui lòng chọn khách thuê"); return;
    }
    if (formTenantMode === "new" && !formNewTenant.name) {
      alert("Vui lòng nhập tên khách thuê"); return;
    }

    setFormLoading(true);
    try {
      let finalTenantId = formTenantId;
      
      if (formTenantMode === "new") {
        const tenantRes = await apiFetch<{id: string}>(`/api/rooms/${formRoomId}/tenants`, {
          method: "POST",
          body: JSON.stringify({ ...formNewTenant, is_representative: true })
        });
        finalTenantId = tenantRes.id;
      }

      // Handle accompanying tenants
      const finalAccompanyingIds: string[] = [];
      for (const at of formAccompanyingTenants) {
        if (at.mode === "new") {
          // Create new accompanying tenant
          const res = await apiFetch<{id: string}>(`/api/rooms/${formRoomId}/tenants`, {
            method: "POST",
            body: JSON.stringify({ name: at.name, phone: at.phone, cccd: at.cccd, is_representative: false })
          });
          finalAccompanyingIds.push(res.id);
        } else if (at.id) {
          // Use existing ID
          finalAccompanyingIds.push(at.id);
        }
      }

      const payload = {
        representative_tenant_id: finalTenantId,
        start_date: formStartDate,
        end_date: formEndDate,
        rent_amount: Number(formRent),
        deposit_amount: Number(formDeposit),
        document_photos: formPhotos,
        tenant_ids: [finalTenantId, ...finalAccompanyingIds],
        auto_renew_months: formAutoRenew ? formAutoRenewMonths : null,
        status: "ACTIVE" // Default status for new contract
      };

      await apiFetch(`/api/rooms/${formRoomId}/contracts`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      
      router.push("/contracts");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi lưu hợp đồng");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center gap-3 mb-2">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()}
          className="rounded-full h-10 w-10 shrink-0"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">Tạo hợp đồng</h1>
      </div>

      <div className="flex-1 w-full max-w-3xl mx-auto">
        <form onSubmit={handleSave} className="space-y-6">
          
          {/* Bước 1: Tải lên tài liệu hợp đồng */}
          <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-5 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-semibold text-lg flex items-center gap-2 text-foreground">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                  Bước 1: Tải lên tài liệu hợp đồng
                </h2>
                <p className="text-xs text-muted-foreground">
                  Tải lên các trang ảnh hợp đồng để AI tự động trích xuất thông tin
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                  className="border-primary text-primary hover:bg-primary/5"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Chọn ảnh
                </Button>
                <Button 
                  type="button" 
                  size="sm" 
                  onClick={handleCameraCapture}
                  disabled={analyzing}
                  className="bg-primary hover:bg-primary/95 text-white"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Chụp ảnh
                </Button>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                multiple 
                onChange={handleAnalyzeAndUpload} 
                disabled={analyzing}
              />
              <input 
                type="file" 
                ref={cameraInputRef} 
                className="hidden" 
                accept="image/*" 
                capture="environment" 
                onChange={handleAnalyzeAndUpload} 
                disabled={analyzing}
              />
            </div>
            
            {formPhotos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {formPhotos.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border group bg-muted shadow-sm">
                    <img 
                      src={url} 
                      alt="Contract doc" 
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                      onClick={() => setPreviewImage(url)} 
                    />
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removePhoto(idx); }}
                      className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full shadow-sm hover:bg-black/80 transition-colors z-10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div 
                className="border-2 border-dashed border-primary/20 hover:border-primary/50 rounded-xl p-8 flex flex-col items-center justify-center text-muted-foreground bg-primary/[0.01] hover:bg-primary/[0.03] transition-colors group"
              >
                <Camera className="w-8 h-8 mb-3 text-primary opacity-60 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-foreground mb-3">Tải lên hoặc chụp ảnh hợp đồng để tiếp tục</span>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => !analyzing && fileInputRef.current?.click()}
                    disabled={analyzing}
                    className="border-primary/40 text-primary hover:bg-primary/5"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Chọn từ máy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => !analyzing && handleCameraCapture()}
                    disabled={analyzing}
                    className="bg-primary hover:bg-primary/95 text-white"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Chụp ảnh
                  </Button>
                </div>
                <span className="text-xs mt-3">Chỉ nhận các file ảnh (PNG, JPG, WEBP)</span>
              </div>
            )}

            {analyzing && (
              <div className="p-6 border border-primary/20 rounded-xl bg-primary/[0.01] flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-300">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <div className="text-center">
                  <p className="font-semibold text-primary">Đang quét hợp đồng và trích xuất dữ liệu...</p>
                </div>
              </div>
            )}
          </div>

          {/* Bước 2: Thông tin phòng thuê & Khách đại diện */}
          <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-foreground">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
              Bước 2: Xác nhận phòng & Khách thuê đại diện
            </h2>
            
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label>Nhà <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  options={buildings.map((b) => {
                    const fullAddress = [b.address, b.ward].filter(Boolean).join(", ") || "Chưa có địa chỉ";
                    return {
                      value: b.id,
                      label: `${b.name} - ${fullAddress}`,
                      displayLabel: b.name,
                    };
                  })}
                  value={formBuildingId}
                  onValueChange={(v) => setFormBuildingId(v)}
                  placeholder="Chọn nhà"
                  searchPlaceholder="Tìm kiếm nhà..."
                  emptyMessage="Không tìm thấy nhà."
                />
              </div>
              <div className="space-y-2">
                <Label>Phòng <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  options={formRooms.map((r) => ({ 
                    value: r.id, 
                    label: `${r.name}${r.status === 'OCCUPIED' ? ' (Đang thuê)' : ''}`,
                    disabled: r.status === 'OCCUPIED'
                  }))}
                  value={formRoomId}
                  onValueChange={(v) => setFormRoomId(v)}
                  placeholder="Chọn phòng"
                  searchPlaceholder="Tìm kiếm phòng..."
                  emptyMessage="Không tìm thấy phòng."
                  disabled={!formBuildingId}
                />
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Khách thuê đại diện <span className="text-destructive">*</span></Label>
                <div className="flex bg-muted p-0.5 rounded-lg text-xs">
                  <button 
                    type="button" 
                    onClick={() => setFormTenantMode("existing")}
                    className={`px-3 py-1 font-medium rounded-md transition-all ${formTenantMode === "existing" ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
                  >
                    Khách cũ
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setFormTenantMode("new")}
                    className={`px-3 py-1 font-medium rounded-md transition-all ${formTenantMode === "new" ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
                  >
                    Tạo mới
                  </button>
                </div>
              </div>

              {suggestedTenant && (
                <div className="flex items-center justify-between p-3.5 bg-primary/10 border border-primary/20 rounded-xl animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-primary">Phát hiện khách cũ trùng khớp</p>
                      <p className="text-xs text-muted-foreground">
                        Tìm thấy thông tin khách thuê <strong className="text-foreground">{suggestedTenant.name}</strong> trùng khớp CCCD/SĐT trong hệ thống.
                      </p>
                    </div>
                  </div>
                  <Button 
                    type="button" 
                    size="sm" 
                    onClick={() => {
                      setFormTenantMode("existing");
                      setFormTenants(prev => {
                        if (prev.some(t => t.id === suggestedTenant.id)) return prev;
                        return [...prev, suggestedTenant];
                      });
                      setFormTenantId(suggestedTenant.id);
                      setAiMatchedTenant(suggestedTenant);
                      setSuggestedTenant(null);
                      toast.success(`Đã chọn khách thuê cũ: ${suggestedTenant.name}`);
                    }}
                    className="shrink-0 bg-primary hover:bg-primary/95 text-white text-xs px-3 py-1.5 h-8 font-medium"
                  >
                    Điền nhanh
                  </Button>
                </div>
              )}
              
              {formTenantMode === "existing" ? (
                <SearchableSelect
                  options={formTenants.map((t) => ({
                    value: t.id,
                    label: `${t.name}${t.phone ? ` - ${t.phone}` : ""}`,
                  }))}
                  value={formTenantId}
                  onValueChange={(v) => setFormTenantId(v)}
                  placeholder="Chọn khách thuê đại diện"
                  searchPlaceholder="Tìm kiếm khách thuê..."
                  emptyMessage={formTenants.length === 0 ? "Phòng chưa có khách nào" : "Không tìm thấy khách thuê."}
                  disabled={!formRoomId}
                />
              ) : (
                <div className="grid gap-4 bg-muted/20 p-4 rounded-xl border">
                  <Input 
                    placeholder="Họ và tên" 
                    value={formNewTenant.name} 
                    onChange={e => setFormNewTenant({...formNewTenant, name: e.target.value})} 
                    required={formTenantMode === "new"}
                    className="h-10 bg-background"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input 
                      placeholder="Số điện thoại" 
                      value={formNewTenant.phone} 
                      onChange={e => setFormNewTenant({...formNewTenant, phone: e.target.value})} 
                      className="h-10 bg-background"
                    />
                    <Input 
                      placeholder="CCCD/CMND" 
                      value={formNewTenant.cccd} 
                      onChange={e => setFormNewTenant({...formNewTenant, cccd: e.target.value})} 
                      className="h-10 bg-background"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <AccompanyingTenantsSection 
                buildingId={formBuildingId}
                tenants={formAccompanyingTenants}
                onChange={setFormAccompanyingTenants}
                excludeIds={[formTenantId].filter(Boolean)}
              />
            </div>
          </div>

          {/* Bước 3: Thông tin hợp đồng */}
          <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-foreground">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
              Bước 3: Xác nhận thời hạn & Tiền thuê
            </h2>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ngày bắt đầu <span className="text-destructive">*</span></Label>
                <Input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} required className="h-10" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase">Số tháng</Label>
                  <Input 
                    type="number" 
                    placeholder="Nhập số tháng..." 
                    value={durationMonths} 
                    onChange={e => setDuration(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="flex-[1.5] space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase">Ngày kết thúc <span className="text-destructive">*</span></Label>
                  <Input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} required className="h-10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tiền phòng (VND) <span className="text-destructive">*</span></Label>
                <Input type="text" value={formatCurrency(formRent)} onChange={e => setFormRent(e.target.value.replace(/\D/g, ""))} className="h-10" required />
              </div>
              <div className="space-y-2">
                <Label>Tiền cọc (VND)</Label>
                <Input type="text" value={formatCurrency(formDeposit)} onChange={e => setFormDeposit(e.target.value.replace(/\D/g, ""))} className="h-10" />
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Gia hạn tự động</Label>
                  <p className="text-xs text-muted-foreground italic">
                    Tự động cộng thêm tháng khi hợp đồng hết hạn
                  </p>
                </div>
                <div 
                  onClick={() => setFormAutoRenew(!formAutoRenew)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors ${formAutoRenew ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formAutoRenew ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </div>

              {formAutoRenew && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Label className="text-xs">Số tháng gia hạn mỗi chu kỳ</Label>
                  <Input 
                    type="number" 
                    min={1} 
                    value={formAutoRenewMonths} 
                    onChange={e => setFormAutoRenewMonths(Number(e.target.value))} 
                    className="max-w-[150px] h-10"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 pt-4 pb-10">
            <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => router.push("/contracts")}>Hủy</Button>
            <Button type="submit" disabled={formLoading || analyzing} className="flex-1 h-11 bg-gradient-to-r from-primary-gradient-start to-primary-gradient-end hover:opacity-90 text-primary-foreground">
              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tạo hợp đồng
            </Button>
          </div>
        </form>
      </div>

      {/* Image Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl w-[90vw] p-0 overflow-hidden bg-black border-none [&>button]:text-white">
          <DialogTitle className="sr-only">Xem ảnh</DialogTitle>
          {previewImage && (
            <div className="relative w-full h-[80vh] flex flex-col">
              <div className="flex-1 overflow-auto flex items-center justify-center p-2">
                <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="p-4 bg-black/80 border-t border-white/10 flex justify-center">
                <Button variant="secondary" onClick={() => handleDownload(previewImage)} className="w-full sm:w-auto">
                  <Download className="w-4 h-4 mr-2" />
                  Lưu về máy
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Camera Capture Modal */}
      <Dialog 
        open={isCameraOpen} 
        onOpenChange={(open) => {
          if (!open) {
            stopCamera();
            setIsCameraOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-md w-[95vw] p-4 bg-background border rounded-2xl shadow-xl flex flex-col space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Chụp ảnh hợp đồng
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Căn chỉnh trang hợp đồng thẳng thắn để AI trích xuất thông tin chính xác nhất.
            </DialogDescription>
          </DialogHeader>

          {/* Camera device selection if multiple cameras exist */}
          {cameraDevices.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">Chọn camera:</span>
              <select 
                value={selectedDeviceId}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="flex-1 bg-muted/50 border rounded-lg px-2 py-1 outline-none text-foreground"
              >
                {cameraDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.substring(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Video stream viewport */}
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black border shadow-inner">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            
            {/* Visual overlay guidelines */}
            <div className="absolute inset-4 border border-dashed border-white/40 pointer-events-none rounded-lg flex items-center justify-center">
              <span className="text-[10px] text-white/50 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-xs">
                Đặt tài liệu vào khung này
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 h-11 rounded-xl"
              onClick={() => {
                stopCamera();
                setIsCameraOpen(false);
              }}
            >
              Hủy
            </Button>
            <Button 
              type="button" 
              className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/95 text-white"
              onClick={capturePhoto}
            >
              <Camera className="w-4 h-4 mr-2" />
              Chụp ảnh
            </Button>
          </div>

          {/* Hidden canvas used to grab the frame */}
          <canvas ref={canvasRef} className="hidden" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NewContractPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <NewContractForm />
    </Suspense>
  );
}
