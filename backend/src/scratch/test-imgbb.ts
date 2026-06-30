import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || "7d2dc77b71b5361281861f96afbcd67e";

async function test() {
  console.log("Using API Key:", IMGBB_API_KEY);
  // Mock image: 1x1 transparent pixel
  const base64Data = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  const formData = new URLSearchParams();
  formData.append("image", base64Data);

  try {
    const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    console.log("Upload Response Data:", JSON.stringify(response.data, null, 2));

    const deleteUrl = response.data.data.delete_url;
    console.log("Delete URL:", deleteUrl);

    // Let's try to fetch the delete page
    const getDeletePage = await axios.get(deleteUrl);
    const html = getDeletePage.data;
    console.log("Fetched delete page length:", html.length);

    // Let's search for "delete" or "auth_token" or similar in the HTML
    // Sometimes it's a form or an action link
    const authActionRegex = /action=["']([^"']*)["']/gi;
    let match;
    console.log("Finding form actions in delete page:");
    while ((match = authActionRegex.exec(html)) !== null) {
      console.log("Action found:", match[1]);
    }
  } catch (error: any) {
    console.error("Error:", error?.response?.data || error.message);
  }
}

test();
