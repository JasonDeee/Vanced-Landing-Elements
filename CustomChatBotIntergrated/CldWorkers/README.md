# Vanced Customer Support Chatbot - Cloudflare Workers

## Mô tả

Chatbot customer support đơn giản sử dụng Cloudflare Workers và Gemini Flash Lite.

## Cấu trúc file

- `New_worker.js` - Logic chính của Workers
- `Data.js` - Dữ liệu tuned và system prompts
- `wrangler.toml` - Cấu hình Cloudflare Workers
- `README.md` - Hướng dẫn này

## Setup và Deployment

### 1. Cài đặt Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Đăng nhập Cloudflare

```bash
wrangler login
```

### 3. Cấu hình Environment Variables

Thêm GEMINI_API_1 vào Cloudflare Dashboard:

1. Vào Workers & Pages > vanced-support-chatbot
2. Settings > Environment Variables
3. Thêm: `GEMINI_API_1` = `your-gemini-api-key`

### 4. Deploy

```bash
# Development
wrangler deploy --env development

# Production
wrangler deploy --env production
```

### 5. Test

```bash
# Test local
wrangler dev

# Test deployed
curl -X POST https://vanced-support-chatbot.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"message": "Xin chào"}'
```

## API Endpoints

### POST /

Gửi tin nhắn chat

```json
{
  "message": "Câu hỏi của user",
  "chatHistory": [
    { "role": "user", "content": "Tin nhắn trước" },
    { "role": "assistant", "content": "Phản hồi trước" }
  ]
}
```

Response:

```json
{
  "response": "Phản hồi từ bot",
  "needsHumanSupport": false,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### GET /

Health check endpoint

## Cấu hình

### Gemini API

- Model: `gemini-flash-lite-latest`
- API Key: Lưu trong environment variable `GEMINI_API_1`

### CORS

- Cho phép tất cả origins (`*`)
- Methods: GET, POST, OPTIONS
- Headers: Content-Type, Authorization

## Monitoring

### Logs

```bash
wrangler tail
```

### Metrics

Xem trong Cloudflare Dashboard > Analytics

## Troubleshooting

### Lỗi thường gặp

1. **API Key không hợp lệ**: Kiểm tra environment variable
2. **CORS errors**: Đảm bảo preflight requests được xử lý
3. **Rate limiting**: Gemini API có giới hạn requests

### Debug

```bash
# Xem logs real-time
wrangler tail --format pretty

# Test local với debug
wrangler dev --local --port 8787
```

## Development

### Cập nhật dữ liệu tuned

Chỉnh sửa `Data.js` > `TUNED_DATA` và deploy lại.

### Thêm tính năng mới

1. Cập nhật `New_worker.js`
2. Test local với `wrangler dev`
3. Deploy với `wrangler deploy`

## Security

### Best Practices

- API keys lưu trong environment variables
- Validate input data
- Rate limiting (implement nếu cần)
- Content filtering với Gemini safety settings

### Environment Variables

- `GEMINI_API_1`: Gemini API key (required)
- Các biến khác sẽ được thêm sau

## Future Enhancements

- [ ] Chat history persistence với KV storage
- [ ] Rate limiting
- [ ] Analytics tracking
- [ ] Multi-language support
- [ ] Integration với Google Sheets
