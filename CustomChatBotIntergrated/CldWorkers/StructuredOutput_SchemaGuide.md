# Respone Schema

> Todo: Hãy giúp tôi cấu tại hình phía workers để model trả về response theo structure sau

- responseMessage:
  - type: string,
  - required: true,
  - Description: "Response message from the user here."
- isRequestForRealPerson:
  - type: boolean,
  - required: true,
  - Description: "If the user is requesting for real person or not."
- Summerize:
  - type: string,
  - required: false,
  - Description: "Summarize the entire conversation here, Highlight the special info such as Phone Number, Name, Address, Career if the user give."

# Flow

Sau khi nhận response, workers sẽ [gửi toàn bộ các trường trong structure trên về phía spreadsheet] và [chỉ gửi responseMessage và isRequestForRealPerson về phía client].

Summerize sẽ được đồng bộ vào cột mới với tên là "Summerize" trong spreadsheet (Cột H) ngay sau cột 'LastRequestTimeStamp'. Summerize sẽ được tạo mỗi tin nhắn. Nội dng Summerize mới sẽ thay thế cũ và không cần lưu lại history.

# Code mẫu từ OpenRouter

Model hiện tại openai/gpt-oss-20b:free có hỗ trợ json_schema.
Có validate schema nhé.

```js
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <OPENROUTER_API_KEY>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4',
    messages: [
      { role: 'user', content: 'What is the weather like in London?' },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'weather',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City or location name',
            },
            temperature: {
              type: 'number',
              description: 'Temperature in Celsius',
            },
            conditions: {
              type: 'string',
              description: 'Weather conditions description',
            },
          },
          required: ['location', 'temperature', 'conditions'],
          additionalProperties: false,
        },
      },
    },
  }),
});
const data = await response.json();
const weatherInfo = data.choices[0].message.content;`
```
