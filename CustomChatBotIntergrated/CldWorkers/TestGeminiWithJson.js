const functions = require("@google-cloud/functions-framework");
const fs = require("fs").promises;
const path = require("path");

// Gemini API Endpoints
const UPLOAD_ENDPOINT =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GENERATE_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";

// Lấy API key và CORS URL từ environment variable
const Vx_Gemini_API_KEY = process.env.Gemini_API_KEY;
const Vx_Allow_CORS = process.env.Allow_URL;

// CORS headers configuration
const corsHeaders = {
  "Access-Control-Allow-Origin": Vx_Allow_CORS || "https://beta.vanced.media",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Origin",
  "Access-Control-Max-Age": "86400",
};

// Class quản lý file cache
class FileManager {
  constructor() {
    this.cachedFileUri = null;
    this.fileExpirationTime = null;
  }

  isValidFile() {
    return (
      this.cachedFileUri &&
      this.fileExpirationTime &&
      new Date() < new Date(this.fileExpirationTime)
    );
  }

  updateCache(uploadResponse) {
    this.cachedFileUri = uploadResponse.file.uri;
    this.fileExpirationTime = uploadResponse.file.expirationTime;
    console.log("Cache updated:", {
      uri: this.cachedFileUri,
      expires: this.fileExpirationTime,
    });
  }
}

const fileManager = new FileManager();

// Function upload file JSON lên Gemini
async function uploadJsonToGemini() {
  try {
    console.group("📤 Uploading Text to Gemini");

    // Đọc file Text
    const textContent = await fs.readFile(
      path.join(__dirname, "Data.txt"),
      "utf8"
    );
    console.log("📄 Text content loaded");

    // Convert to base64
    const base64Data = Buffer.from(textContent).toString("base64");
    const numBytes = Buffer.from(textContent).length;
    console.log("📊 File size:", numBytes, "bytes");

    // Upload to Gemini
    const uploadResponse = await fetch(
      `${UPLOAD_ENDPOINT}?key=${Vx_Gemini_API_KEY}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Command": "start, upload, finalize",
          "X-Goog-Upload-Header-Content-Length": numBytes.toString(),
          "X-Goog-Upload-Header-Content-Type": "text/plain",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: {
            display_name: "Vx_Data_Sample",
            mimeType: "text/plain",
            data: base64Data,
          },
        }),
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorData}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log("✅ Upload successful:", uploadResult);
    console.groupEnd();
    return uploadResult;
  } catch (error) {
    console.error("❌ Upload error:", error);
    console.groupEnd();
    throw error;
  }
}

// Function test Gemini API với file JSON
async function testGeminiWithJson(message) {
  console.group("🚀 Testing Gemini with JSON");
  try {
    // Kiểm tra và lấy valid file URI
    let fileUri;
    if (!fileManager.isValidFile()) {
      console.log("🔄 No valid cached file, uploading new one...");
      const uploadResult = await uploadJsonToGemini();
      fileManager.updateCache(uploadResult);
      fileUri = uploadResult.file.uri;
    } else {
      console.log("✅ Using cached file URI:", fileUri);
      fileUri = fileManager.cachedFileUri;
    }

    // Chuẩn bị request body
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: fileUri,
                mimeType: "text/plain",
              },
            },
            {
              text: message,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: "text/plain",
      },
    };

    console.log(
      "📝 Request body prepared:",
      JSON.stringify(requestBody, null, 2)
    );

    // Gọi Gemini API
    console.log("🤖 Calling Gemini API...");
    const generateResponse = await fetch(
      `${GENERATE_ENDPOINT}?key=${Vx_Gemini_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!generateResponse.ok) {
      const errorData = await generateResponse.json();
      throw new Error(`Generation failed: ${JSON.stringify(errorData)}`);
    }

    const result = await generateResponse.json();
    console.log("✅ Gemini response:", result);
    console.groupEnd();
    return result;
  } catch (error) {
    console.error("❌ Test error:", error);
    console.groupEnd();
    throw error;
  }
}

// HTTP Function để test API với CORS support
functions.http("testGemini", async (req, res) => {
  // Set CORS headers cho tất cả các responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.set(key, value);
  });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    if (req.method !== "POST") {
      res.status(405).json({
        success: false,
        error: "Method Not Allowed",
      });
      return;
    }

    const message = req.body.message;
    if (!message) {
      res.status(400).json({
        success: false,
        error: "Message is required",
      });
      return;
    }

    const result = await testGeminiWithJson(message);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in HTTP function:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

// Thêm handler riêng cho OPTIONS request
functions.http("corsHandler", (req, res) => {
  if (req.method === "OPTIONS") {
    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.set(key, value);
    });
    res.status(204).send("");
    return;
  }
  res.status(405).send("Method not allowed");
});

// Export functions for testing
module.exports = {
  uploadJsonToGemini,
  testGeminiWithJson,
  fileManager,
  corsHeaders,
};
