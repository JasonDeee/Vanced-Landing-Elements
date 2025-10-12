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
- [x] **Client P2P Implementation (PeerJS)**
- [x] **Admin Dashboard UI (Messenger-style)**
- [x] **P2P Connection Management**
- [x] **Chat History Management (Admin responsibility)**
- [x] **Timeout & Warning Systems**
- [x] **Email notification system**
- [ ] **🎯 ĐANG LÀM: Custom Signaling Server Implementation**

### Phase 6.5: Custom Signaling Server 🚧

- [ ] **🎯 HIỆN TẠI: Signaling Server Architecture Design**
- [ ] **Backend Implementation (Apps Script vs WebSocket vs Cloudflare)**
- [ ] **WebRTC Signaling Protocol Implementation**
- [ ] **SDP & ICE Candidates Exchange**
- [ ] **Connection State Management**
- [ ] **Fallback & Error Handling**

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

### Dang lam (Phase 6.5):

- 🎯 **Custom Signaling Server** - Muc tieu chinh tiep theo
- ✅ P2P Human Support System (UI & Logic) completed
- ✅ All PeerJS public servers down - need custom solution
- � ASignaling Server Architecture Design
- 📝 Backend Implementation (Apps Script vs WebSocket vs Cloudflare)
- 📝 WebRTC Signaling Protocol

### Can lam tiep (Phase 7):

- 📝 End-to-end testing
- 📝 UI/UX improvements
- 📝 Mobile optimization

## NEXT STEPS - Custom Signaling Server �

### Van de hien tai:

**Tat ca PeerJS public servers deu down** - Can custom signaling server implementation

### Muc tieu:

Implement custom signaling server de thay the PeerJS:

1. **WebRTC Signaling Protocol** - SDP offer/answer exchange
2. **ICE Candidates Exchange** - Network connectivity info
3. **Connection State Management** - Peer registration & discovery
4. **Real-time Communication** - WebSocket hoac polling
5. **Fallback Mechanisms** - Error handling & reconnection

### Tasks can lam:

1. **Signaling Server Architecture** 🚧

   - Chon backend platform (Apps Script vs WebSocket vs Cloudflare)
   - Design signaling protocol
   - Connection state management
   - Error handling & timeouts

2. **WebRTC Implementation** 📝

   - Replace PeerJS voi native WebRTC APIs
   - SDP offer/answer handling
   - ICE candidates exchange
   - Connection establishment

3. **Backend Integration** 📝

   - Signaling server endpoints
   - Real-time communication (WebSocket/Polling)
   - Peer registration & discovery
   - Connection cleanup

4. **Client Updates** 📝
   - Remove PeerJS dependency
   - Implement custom WebRTC client
   - Update UI for new signaling flow
   - Error handling & reconnection

### Implementation Options Analysis:

#### Option 1: Apps Script + Spreadsheet Signaling

**Pros:**

- ✅ Su dung infrastructure co san
- ✅ Khong can server moi
- ✅ Integrated voi system hien tai
- ✅ Don gian implement

**Cons:**

- ❌ Polling-based (khong real-time)
- ❌ Rate limiting issues
- ❌ Latency cao cho signaling
- ❌ Khong scale tot

#### Option 2: Cloudflare Workers + Durable Objects

**Pros:**

- ✅ Real-time WebSocket support
- ✅ Global edge network
- ✅ Scalable architecture
- ✅ Integrated voi Workers hien tai

**Cons:**

- ❌ Phuc tap implement
- ❌ Can hoc Durable Objects
- ❌ Cost implications
- ❌ WebSocket limits

#### Option 3: Simple WebSocket Server (Node.js)

**Pros:**

- ✅ Full control over signaling
- ✅ Real-time WebSocket
- ✅ Mature WebRTC libraries
- ✅ Easy to implement

**Cons:**

- ❌ Can host server rieng
- ❌ Infrastructure management
- ❌ Scaling challenges
- ❌ Additional complexity

### Recommended Approach: **Apps Script Signaling** (Phase 1)

**Ly do:**

- 🎯 Fastest to implement
- 🎯 Uses existing infrastructure
- 🎯 Good enough for customer support use case
- 🎯 Can upgrade later if needed

### Technical Specifications:

- **Signaling Protocol:** HTTP polling via Apps Script
- **SDP Exchange:** Store offers/answers in Spreadsheet
- **ICE Candidates:** Batch exchange via polling
- **Connection Discovery:** Spreadsheet-based peer registry
- **Polling Interval:** 2-3 seconds for signaling
- **Timeout:** 30 seconds for connection establishment

## Technical Notes

- ✅ Su dung lai toan bo UI cu, chi thay doi logic
- ✅ Storage da implement voi Google Spreadsheet
- ✅ Rate limiting: 15 msg/day, 1 msg/minute
- ✅ MachineID fingerprinting cho user tracking
- ✅ Async updates voi ctx.waitUntil() cho performance
- ✅ P2P Architecture design completed
- ✅ P2P Human Support system UI & logic completed
- 🚨 **PeerJS public servers all down** - blocking P2P connections
- 🎯 **Custom Signaling Server** implementation required
- **Recommended:** Apps Script + Spreadsheet signaling (polling-based)
- **Alternative:** Cloudflare Workers + Durable Objects (WebSocket)
- **Fallback:** Simple Node.js WebSocket server
- Focus: WebRTC signaling protocol implementation
- Custom signaling: SDP exchange + ICE candidates via HTTP polling

## Debug Status

- Workers Debug: ✅ Active (`DeBug_IsActive = true`)
- Apps Script Debug: ✅ Active (`DeBug_IsActive = true`)
- Frontend Debug: ✅ Active (`DeBug_IsActive = true`)

## Performance Metrics

- Response time: ~200-500ms faster (async updates)
- Spreadsheet calls: Reduced from 2-3 → 1 batch call
- Error handling: Comprehensive logging system
