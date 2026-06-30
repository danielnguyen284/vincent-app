import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || "";

export async function uploadToImgBB(base64Image: string): Promise<string> {
  if (!IMGBB_API_KEY) {
    throw new Error("IMGBB_API_KEY is not configured");
  }

  // Strip prefix like data:image/png;base64,
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const formData = new URLSearchParams();
  formData.append("key", IMGBB_API_KEY);
  formData.append("image", base64Data);

  const res = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`ImgBB upload failed: ${res.status} - ${errorBody}`);
  }

  const responseJson = (await res.json()) as {
    data: { url: string; delete_url: string };
  };

  const url = responseJson.data.url;
  const delete_url = responseJson.data.delete_url;

  if (url) {
    try {
      const { UploadedFile } = await import("../entities/UploadedFile");
      const { AppDataSource } = await import("../data-source");
      const fileRepo = AppDataSource.getRepository(UploadedFile);
      const uploadedFile = fileRepo.create({ url, delete_url });
      await fileRepo.save(uploadedFile);
      console.log(`Saved image metadata to database: ${url}`);
    } catch (dbErr) {
      console.error("Failed to save uploaded file mapping to database:", dbErr);
    }
  }

  return url;
}

export async function deleteFromImgBB(url: string): Promise<boolean> {
  try {
    const { UploadedFile } = await import("../entities/UploadedFile");
    const { AppDataSource } = await import("../data-source");
    const fileRepo = AppDataSource.getRepository(UploadedFile);

    const record = await fileRepo.findOneBy({ url });
    if (!record || !record.delete_url) {
      console.warn(`No delete URL found in database for image URL: ${url}`);
      return false;
    }

    const urlObj = new URL(record.delete_url);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      console.warn(`Invalid delete URL format: ${record.delete_url}`);
      return false;
    }

    const imageId = parts[0];
    const imageHash = parts[1];

    const formData = new URLSearchParams();
    formData.append("action", "delete");
    formData.append("delete", "image");
    formData.append("deleting[id]", imageId);
    formData.append("deleting[hash]", imageHash);

    const res = await axios.post("https://ibb.co/json", formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: record.delete_url,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const success = res.data && res.data.status_code === 200;
    if (success) {
      await fileRepo.remove(record);
      console.log(`Successfully deleted image from ImgBB and DB: ${url}`);
    } else {
      console.error(`ImgBB delete response did not indicate success for ${url}:`, res.data);
    }
    return success;
  } catch (error) {
    console.error(`Failed to delete image ${url} from ImgBB:`, error);
    return false;
  }
}
