// Chuyển đổi cách tiếp cận từ cURL sang JavaScript vào đây

// Constants
const API_KEY = process.env.Gemini_API_KEY;
const UPLOAD_ENDPOINT =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GENERATE_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro-exp-02-05:generateContent";

// File upload function
async function uploadFileToGemini(filePath, mimeType) {
  try {
    const fileContent = await require("fs").promises.readFile(filePath);
    const numBytes = fileContent.length;

    const response = await fetch(`${UPLOAD_ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Command": "start, upload, finalize",
        "X-Goog-Upload-Header-Content-Length": numBytes.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: {
          display_name: filePath,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.file.uri; // Return the file URI for later use
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

// Generate content function
async function generateContent(fileUri, userMessage) {
  try {
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: fileUri,
                mimeType: "application/vnd.google-apps.spreadsheet",
              },
            },
            {
              text: "Xin chào.",
            },
          ],
        },
        {
          role: "model",
          parts: [
            {
              text: "Chào bạn, tôi là Lara - tư vấn viên của Vanced Media. Tôi có thể giúp gì cho bạn?,* Bạn có thể tư vấn cho tôi về dịch vụ thiết kế landing page không? * Vanced Media là gì? * Tôi có thể tìm các mẫu landing page ở đâu?,Brand Inquiry,General,xin chào,Thân thiện\n",
            },
          ],
        },
        {
          role: "user",
          parts: [
            {
              text: userMessage,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 1,
        topK: 64,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
      },
    };

    const response = await fetch(`${GENERATE_ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error generating content:", error);
    throw error;
  }
}

// Main function to handle chat
async function handleChat(filePath, userMessage) {
  try {
    // Step 1: Upload file
    console.log("Uploading file...");
    const fileUri = await uploadFileToGemini(
      filePath,
      "application/vnd.google-apps.spreadsheet"
    );
    console.log("File uploaded successfully, URI:", fileUri);

    // Step 2: Generate content
    console.log("Generating response...");
    const response = await generateContent(fileUri, userMessage);
    console.log("Response received:", response);

    return response;
  } catch (error) {
    console.error("Error in chat handling:", error);
    throw error;
  }
}

// Example usage
// handleChat('Vx_ChatBot-Tuner_Sample', 'Xin chào').then(console.log).catch(console.error);

module.exports = {
  handleChat,
  uploadFileToGemini,
  generateContent,
};
