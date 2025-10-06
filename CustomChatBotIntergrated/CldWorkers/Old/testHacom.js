const OPENROUTER_API_KEY = "";

async function opusRequestOpenRouter(userContent) {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const payload = {
    model: "meta-llama/llama-4-maverick:free",
    messages: [
      // {
      //   role: "system",
      //   content: "You are a helpful assistant.",
      // },
      {
        role: "user",
        content: userContent,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "product_ids",
        strict: true,
        schema: {
          type: "array",
          description: "Array of ids of products that you want to select",
        },
      },
    },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { error: "Lỗi request OpenRouter: " + err };
  }
}

// onDomloaded

document.addEventListener("DOMContentLoaded", async () => {
  const result = await opusRequestOpenRouter(
    "14700K có id là 195000, hãy trả về id của nó"
  );
  console.log(result);
});
