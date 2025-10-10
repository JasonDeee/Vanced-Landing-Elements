const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

/**
 * Uploads the given file to Gemini.
 *
 * See https://ai.google.dev/gemini-api/docs/prompting_with_media
 */
async function uploadToGemini(path, mimeType) {
  const uploadResult = await fileManager.uploadFile(path, {
    mimeType,
    displayName: path,
  });
  const file = uploadResult.file;
  console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
  return file;
}

/**
 * Waits for the given files to be active.
 *
 * Some files uploaded to the Gemini API need to be processed before they can
 * be used as prompt inputs. The status can be seen by querying the file's
 * "state" field.
 *
 * This implementation uses a simple blocking polling loop. Production code
 * should probably employ a more sophisticated approach.
 */
async function waitForFilesActive(files) {
  console.log("Waiting for file processing...");
  for (const name of files.map((file) => file.name)) {
    let file = await fileManager.getFile(name);
    while (file.state === "PROCESSING") {
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      file = await fileManager.getFile(name);
    }
    if (file.state !== "ACTIVE") {
      throw Error(`File ${file.name} failed to process`);
    }
  }
  console.log("...all files ready\n");
}

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-thinking-exp-01-21",
});

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 65536,
  responseMimeType: "text/plain",
};

async function run() {
  // TODO Make these files available on the local file system
  // You may need to update the file paths
  const files = [
    await uploadToGemini(
      "Vx_ChatBot-Tuner_Sample",
      "application/vnd.google-apps.spreadsheet"
    ),
  ];

  // Some files have a processing delay. Wait for them to be ready.
  await waitForFilesActive(files);

  const chatSession = model.startChat({
    generationConfig,
    history: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              mimeType: files[0].mimeType,
              fileUri: files[0].uri,
            },
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: "--- END OF FILE Vx_ChatBot-Tuner_Sample ---\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\nTemplate này được thiết kế bởi Vanced Media. Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.\n",
          },
        ],
      },
    ],
  });

  const result = await chatSession.sendMessage("INSERT_INPUT_HERE");
  console.log(result.response.text());
}

run();
