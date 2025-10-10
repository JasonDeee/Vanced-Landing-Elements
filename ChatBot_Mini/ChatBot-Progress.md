# Vanced Customer Support Chatbot - Progress & Checklist

## Mo ta du an

Tao chatbot customer support don gian dua tren UI hien tai, su dung Cloudflare Workers va OpenRouter API.

## Kien truc hien tai

```
Frontend (Chat UI) → Cloudflare Workers → OpenRouter API → Google Spreadsheet
```

## Thay doi chinh

- ❌ Loai bo toan bo PC Builder logic
- ❌ Loai bo complex prompt chaining (Chunk 2, 3)
- ❌ Loai bo Hacom API integration
- ✅ Su dung OpenRouter API (thay vi Gemini)
- ✅ Giu lai Chat UI components
- ✅ Giu lai Human support request flow
- ✅ Su dung Cloudflare Workers
- ✅ Tich hop Google Spreadsheet cho data management
- ✅ Tich hop du lieu tuned cho customer support
- ✅ MachineID fingerprinting va rate limiting

## Cau truc file

### 1. Frontend

- `Simple-ChatBot.html` - HTML su dung lai UI cu, loai bo PC Builder
- `Styles/PcBuildAgent.scss` - Su dung lai CSS cu (khong can thay doi)
- `Scripts/Simple-ChatBot.js` - JavaScript moi cho chat logic

### 2. Backend (Cloudflare Workers)

- `CldWorkers/Data.js` - Du lieu tuned dang [Cau hoi]-[Cau tra loi]
- `CldWorkers/New_worker.js` - Logic chinh cua Workers
- `CldWorkers/BanList.js` - Quan ly ban list
- `Scripts/MachineID.js` - Browser fingerprinting

### 3. Apps Script (Google Spreadsheet)

- `SpreadSheet_Gs/UserChatMng.gs` - Quan ly chat history va rate limiting

### 4. Human Support (P2P System)

- `Human_Support/client-p2p.js` - Client P2P logic
- `Human_Support/admin-dashboard.js` - Admin UI + P2P logic
- `Human_Support/admin.html` - Admin interface (Messenger-style)
- `Human_Support/p2p-utils.js` - Shared utilities

### 5. API Configuration

- Model: `openai/gpt-oss-20b:free`
- OpenRouter API Key: `process.env.OPENROUTER_API_KEY`
- Apps Script URL: `process.env.APPS_SCRIPT_URL`
- PeerJS: Public signaling server

## PROGRESS CHECKLIST

### Phase 1: Setup co ban ✅

- [x] Tao file mo ta du an
- [x] Setup Data.js voi template va du lieu mau
- [x] Tao New_worker.js voi cau truc hoan chinh
- [x] Cau hinh Gemini API integration
- [x] Tao wrangler.toml cho deployment
- [x] Tao package.json va README

### Phase 2: Frontend implementation ✅

- [x] Tao Simple-ChatBot.html (su dung lai UI cu)
- [x] Su dung lai Styles/PcBuildAgent.scss (khong can thay doi)
- [x] Tao Scripts/Simple-ChatBot.js voi logic moi
- [x] Loai bo tat ca PC Builder logic
- [x] Giu lai chat interface va human support UI

### Phase 3: Workers Implementation ✅

- [x] Implement basic chat endpoint
- [x] Tich hop OpenRouter API
- [x] Xu ly tuned data trong system prompt
- [x] Implement human support detection
- [x] Error handling va CORS
- [x] Structured response format
- [x] MachineID generation va validation

### Phase 4: Data Management ✅

- [x] Google Spreadsheet integration
- [x] Chat history persistence
- [x] Rate limiting system (15 msg/day, 1 msg/minute)
- [x] User session management
- [x] Ban list functionality
- [x] Apps Script API endpoints

### Phase 5: Performance Optimization ✅

- [x] Async Spreadsheet updates voi ctx.waitUntil()
- [x] Batch operations cho multiple updates
- [x] Debug logging system toan dien
- [x] Error handling va timeout protection
- [x] POST method cho large data transfers

### Phase 6: Human Support P2P System 🚧

- [x] Human support flow detection
- [x] **P2P Architecture Design & Planning**
- [ ] **🎯 ĐANG LÀM: Client P2P Implementation**
- [ ] Admin Dashboard UI (Messenger-style)
- [ ] P2P Connection Management
- [ ] Chat History Management (Admin responsibility)
- [ ] Timeout & Warning Systems
- [ ] Email notification system

### Phase 7: Testing & Polish

- [ ] End-to-end testing
- [ ] Performance testing
- [ ] UI/UX improvements
- [ ] Mobile responsiveness
- [ ] Error message enhancements

## Luong hoat dong don gian

```
User Message → Workers → Gemini (voi tuned data) → Response
                ↓
        (Neu can CSKH) → Human Support UI
```

## CURRENT STATUS: Phase 5 COMPLETED ✅

### Da hoan thanh:

1. ✅ Backend Workers implementation
2. ✅ Frontend chat interface
3. ✅ OpenRouter API integration
4. ✅ Google Spreadsheet integration
5. ✅ Chat history persistence
6. ✅ Rate limiting system
7. ✅ MachineID fingerprinting
8. ✅ Human support detection
9. ✅ Performance optimization
10. ✅ Debug logging system
11. ✅ Error handling va CORS
12. ✅ Async data updates

### Dang lam (Phase 6):

- 🎯 **P2P Human Support System** - Muc tieu chinh tiep theo
- ✅ Architecture & Technical Design completed
- 🚧 Client P2P logic implementation
- 📝 Admin Dashboard UI (Messenger-style)
- 📝 Connection management & timeout systems

### Can lam tiep (Phase 7):

- 📝 End-to-end testing
- 📝 UI/UX improvements
- 📝 Mobile optimization

## NEXT STEPS - P2P Human Support System 🎯

### Muc tieu:

Khi AI detect user muon gap tu van vien that, system se:

1. Khoi tao P2P connection voi custom PeerID
2. Hien thi waiting UI (3 phut timeout)
3. Admin dashboard de quan ly clients
4. P2P chat truc tiep giua client va admin
5. Admin luu chat history len Spreadsheet

### Tasks can lam:

1. **Client P2P Implementation** 🚧

   - Tich hop PeerJS voi custom PeerID format
   - Waiting UI voi 3 phut timeout
   - P2P chat interface
   - Connection error handling

2. **Admin Dashboard** 📝

   - Messenger-style full-screen UI
   - Client list voi search & refresh
   - Warning system cho abandoned connections
   - P2P connection management

3. **Backend Updates** 📝

   - Spreadsheet schema update (cot I format)
   - Email notification system
   - Abandoned connection checker (25 phut)
   - Chat history management

4. **Connection Management** 📝
   - Timeout systems (3 phut client, 25 phut warning)
   - Status tracking (waiting|connected|closed|warn)
   - Admin responsibility cho chat history

### Implementation Plan:

```
User request → Generate PeerID → Wait for admin → P2P Chat → Admin saves history
```

### Technical Specifications:

- **PeerID Format:** `vanced_{machineId}_{timestamp}`
- **Client Timeout:** 3 minutes waiting
- **Admin Warning:** 25 minutes abandoned connection
- **UI Style:** Messenger-like full screen
- **Chat History:** Admin responsibility via Spreadsheet API

## Technical Notes

- ✅ Su dung lai toan bo UI cu, chi thay doi logic
- ✅ Storage da implement voi Google Spreadsheet
- ✅ Rate limiting: 15 msg/day, 1 msg/minute
- ✅ MachineID fingerprinting cho user tracking
- ✅ Async updates voi ctx.waitUntil() cho performance
- ✅ P2P Architecture design completed
- 🎯 P2P Human Support system implementation
- Focus vao P2P direct connection va admin responsibility
- Custom PeerID format: `vanced_{machineId}_{timestamp}`
- Admin dashboard: Messenger-style UI
- Connection management: 3min timeout + 25min warning system

## Debug Status

- Workers Debug: ✅ Active (`DeBug_IsActive = true`)
- Apps Script Debug: ✅ Active (`DeBug_IsActive = true`)
- Frontend Debug: ✅ Active (`DeBug_IsActive = true`)

## Performance Metrics

- Response time: ~200-500ms faster (async updates)
- Spreadsheet calls: Reduced from 2-3 → 1 batch call
- Error handling: Comprehensive logging system
