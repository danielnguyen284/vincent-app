import { Router, Request, Response } from "express";
import { authenticate } from "../middlewares/auth";
import { uploadToImgBB } from "../services/imgbb";

const router = Router();

router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ message: "Image base64 data is required" });
    }

    const url = await uploadToImgBB(image);
    return res.json({ url });
  } catch (error: any) {
    console.error("ImgBB Upload Error:", error);
    return res.status(500).json({ message: error.message || "Internal server error during upload" });
  }
});

export default router;
