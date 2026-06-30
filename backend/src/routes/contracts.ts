import { Router, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source";
import { Contract } from "../entities/Contract";
import { Building } from "../entities/Building";
import { BuildingManager } from "../entities/BuildingManager";
import { UserRole } from "../entities/User";
import { Room, RoomStatus } from "../entities/Room";
import { authenticate, AuthRequest, hasRole } from "../middlewares/auth";
import { getAccessibleBuildingIds } from "../utils/access";
import { Tenant } from "../entities/Tenant";
import axios from "axios";


const router = Router();
const contractRepo = () => AppDataSource.getRepository(Contract);
const buildingRepo = () => AppDataSource.getRepository(Building);
const managerRepo = () => AppDataSource.getRepository(BuildingManager);
const roomRepo = () => AppDataSource.getRepository(Room);

router.use(authenticate);

// GET /api/contracts — List all contracts based on role and optional filters
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { building_id, room_id, status } = req.query;

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, building_id as string | undefined);

    // If not admin and no allowed buildings, return empty
    if (allowedBuildingIds !== null && allowedBuildingIds.length === 0) {
      return res.json([]);
    }

    // Build query
    const qb = contractRepo().createQueryBuilder("c")
      .leftJoinAndSelect("c.room", "r")
      .leftJoinAndSelect("c.representative_tenant", "t")
      .leftJoinAndSelect("c.tenants", "tenants")
      .leftJoinAndSelect("r.floor", "f")
      .leftJoinAndSelect("f.building", "b");

    if (allowedBuildingIds !== null) {
      qb.andWhere("f.building_id IN (:...allowedBuildingIds)", { allowedBuildingIds });
    }

    if (room_id) {
      qb.andWhere("c.room_id = :room_id", { room_id });
    }

    if (status) {
      qb.andWhere("c.status = :status", { status });
    }

    qb.orderBy("c.created_at", "DESC");

    const contracts = await qb.getMany();
    
    // Also include floor information in room manually if needed, 
    // but the query builder selected r and t. 
    // If we need floor or building info we could add leftJoinAndSelect.
    
    res.json(contracts);


  } catch (error) {
    console.error("List contracts error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// GET /api/contracts/:id — Get a single contract with relations
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const contract = await contractRepo().findOne({
      where: { id: req.params.id as string },
      relations: ["room", "representative_tenant", "tenants", "room.floor", "room.floor.building"]
    });

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    // RBAC: Check if user has access to this building
    const buildingId = contract.room.floor.building_id;

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, buildingId);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(buildingId)) {
      return res.status(403).json({ message: "Bạn không có quyền xem hợp đồng này" });
    }

    res.json(contract);
  } catch (error) {
    console.error("Get contract error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// PATCH /api/contracts/:id/notice-to-move — Toggle move out notice
router.patch("/:id/notice-to-move", async (req: AuthRequest, res: Response) => {
  try {
    const { is_moving_out } = req.body;
    const contractId = req.params.id as string;

    const contract = await contractRepo().findOne({
      where: { id: contractId as string },
      relations: ["room", "room.floor"]
    });

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    // RBAC check
    const buildingId = contract.room.floor.building_id;

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, buildingId);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(buildingId)) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    // Update contract
    contract.is_moving_out = is_moving_out;
    await contractRepo().save(contract);

    // Update room status
    // If is_moving_out is true, status = VACATING_SOON
    // If is_moving_out is false, status = OCCUPIED
    const newRoomStatus = is_moving_out ? RoomStatus.VACATING_SOON : RoomStatus.OCCUPIED;
    await roomRepo().update(contract.room_id, { status: newRoomStatus });

    res.json({ message: "Cập nhật thành công", is_moving_out, room_status: newRoomStatus });
  } catch (error) {
    console.error("Toggle notice error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/contracts/analyze — Extract data from contract images using Groq
router.post("/analyze", async (req: AuthRequest, res: Response) => {
  try {
    const { images } = req.body; // array of base64 strings
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: "Vui lòng cung cấp danh sách hình ảnh hợp đồng dưới dạng base64" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ message: "Chưa cấu hình GEMINI_API_KEY trên server" });
    }

    // Fetch accessible buildings to pass to Groq prompt
    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!);
    const buildingRepo = AppDataSource.getRepository(Building);
    
    let buildingsList: Building[] = [];
    if (allowedBuildingIds === null) {
      buildingsList = await buildingRepo.find();
    } else if (allowedBuildingIds.length > 0) {
      buildingsList = await buildingRepo.find({
        where: { id: In(allowedBuildingIds) }
      });
    }

    const buildingsFormatted = buildingsList.map(b => {
      const parts = [b.name, b.address, b.ward, b.district, b.province].filter(Boolean);
      return `- ID: "${b.id}", Tên/Địa chỉ: "${parts.join(", ")}"`;
    }).join("\n");

    const promptText = `Trích xuất thông tin hợp đồng thuê phòng từ ảnh.
Danh sách tòa nhà hiện có:
${buildingsFormatted || "Trống"}

Trả về JSON chính xác theo cấu trúc sau (không thêm văn bản giải thích):
{
  "representative_tenant": { "name": "...", "cccd": "...", "phone": "..." },
  "accompanying_tenants": [ { "name": "...", "cccd": "...", "phone": "..." } ],
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "rent_amount": 123456,
  "deposit_amount": 123456,
  "auto_renew_months": 6,
  "matched_building_id": "ID tòa nhà khớp nhất hoặc null",
  "room_name": "Tên phòng (chỉ chứa chữ/số, ví dụ: 302)"
}

Quy tắc tối quan trọng:
1. KHÔNG đoán mò. Nếu không thấy thông tin trong ảnh, PHẢI trả về null.
2. Đối chiếu số tiền bằng chữ và bằng số để tránh sai sót. Ưu tiên số tiền bằng chữ nếu có mâu thuẫn.
3. CCCD và SĐT chỉ được chứa các chữ số.`;

    const inlineDataImages = images.map(image => {
      let base64Data = image;
      let mimeType = "image/jpeg";
      if (image.startsWith("data:image/")) {
        const matches = image.match(/^data:(image\/\w+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        } else {
          base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        }
      }
      return {
        inlineData: {
          mimeType,
          data: base64Data
        }
      };
    });

    const callGeminiAPI = async (apiKey: string) => {
      return axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              role: "user",
              parts: [
                { text: promptText },
                ...inlineDataImages
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        },
        {
          headers: { "Content-Type": "application/json" }
        }
      );
    };

    let response;
    try {
      response = await callGeminiAPI(process.env.GEMINI_API_KEY);
    } catch (err: any) {
      if (err.response?.status === 429 && process.env.GEMINI_API_KEY_FALLBACK) {
        console.warn("Gemini API rate limit hit, trying fallback key...");
        response = await callGeminiAPI(process.env.GEMINI_API_KEY_FALLBACK);
      } else {
        throw err; // throw to main catch block
      }
    }

    const resultText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      return res.status(500).json({ message: "Không nhận được phản hồi từ AI" });
    }

    let parsedData;
    try {
      parsedData = JSON.parse(resultText);
    } catch (parseError) {
      console.error("JSON parse error from Gemini response:", resultText);
      return res.status(500).json({ message: "Phản hồi từ AI không đúng định dạng JSON" });
    }

    // Now look up existing tenants in accessible buildings
    const tenantRepo = AppDataSource.getRepository(Tenant);
    
    const findMatchingTenant = async (tenantData: { name?: string; phone?: string; cccd?: string }) => {
      if (!tenantData) return null;
      const { phone, cccd } = tenantData;
      
      const conditions: any[] = [];
      if (phone && phone.trim()) {
        conditions.push({ phone: phone.trim() });
      }
      if (cccd && cccd.trim()) {
        conditions.push({ cccd: cccd.trim() });
      }

      if (conditions.length === 0) return null;

      const matches = await tenantRepo.find({
        where: conditions,
        relations: ["room", "room.floor"]
      });

      if (allowedBuildingIds !== null) {
        const filtered = matches.filter(m => m.room?.floor?.building_id && allowedBuildingIds.includes(m.room.floor.building_id));
        return filtered.length > 0 ? filtered[0] : null;
      }
      
      return matches.length > 0 ? matches[0] : null;
    };

    // Process representative tenant
    const repTenant = parsedData.representative_tenant;
    let representative_tenant_match = null;
    if (repTenant) {
      const match = await findMatchingTenant(repTenant);
      if (match) {
        representative_tenant_match = {
          id: match.id,
          name: match.name,
          phone: match.phone,
          cccd: match.cccd,
          room_name: match.room?.name,
          is_existing: true
        };
      }
    }

    // Process accompanying tenants
    const accTenants = parsedData.accompanying_tenants || [];
    const accompanying_tenants_matches = [];
    for (const tenant of accTenants) {
      const match = await findMatchingTenant(tenant);
      if (match) {
        accompanying_tenants_matches.push({
          extracted: tenant,
          match: {
            id: match.id,
            name: match.name,
            phone: match.phone,
            cccd: match.cccd,
            room_name: match.room?.name,
            is_existing: true
          }
        });
      } else {
        accompanying_tenants_matches.push({
          extracted: tenant,
          match: null
        });
      }
    }

    // Match room within the matched building
    let matched_room_id = null;
    if (parsedData.matched_building_id && parsedData.room_name) {
      const rooms = await roomRepo().find({
        where: {
          floor: { building_id: parsedData.matched_building_id }
        },
        relations: ["floor"]
      });

      const normalizeRoomName = (name: string): string => {
        if (!name) return "";
        let clean = name.toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        
        clean = clean.replace(/[^a-z0-9]/g, "");
        
        clean = clean.replace(/^phong/g, "")
                     .replace(/^room/g, "")
                     .replace(/^p(?=\d)/g, "");
        return clean;
      };

      const targetClean = normalizeRoomName(parsedData.room_name);
      const matchedRoom = rooms.find(r => normalizeRoomName(r.name) === targetClean);
      if (matchedRoom) {
        matched_room_id = matchedRoom.id;
      }
    }

    res.json({
      extracted: parsedData,
      representative_tenant_match,
      accompanying_tenants_matches,
      matched_building_id: parsedData.matched_building_id || null,
      matched_room_id: matched_room_id || null
    });
  } catch (error: any) {
    console.error("Analyze contract error:", error?.response?.data || error.message);
    res.status(500).json({ message: "Lỗi phân tích hợp đồng từ AI", error: error.message });
  }
});

export default router;
