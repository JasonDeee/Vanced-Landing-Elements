# Human Support System - Structure & Implementation Guide

## 🎯 Tổng quan hệ thống

Hệ thống Human Support sử dụng **WebSocket real-time chat** để kết nối giữa Client và Admin thông qua **Cloudflare Durable Objects**. Đã loại bỏ hoàn toàn P2P/WebRTC complexity.

### 🏗️ Kiến trúc tổng thể:

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│   Client    │    │ Cloudflare       │    │   Admin     │
│   (User)    │    │ Durable Objects  │    │ (Advisor)   │
└─────────────┘    │ WebSocketChatRoom│    └─────────────┘
       │           └──────────────────┘           │
       │ 1. Support Request                       │
       ├─────────────────────────────────────────►│
       │           Workers → Apps Script          │
       │                   │                      │
       │ 2. WebSocket Connect to /chat/room/{id}  │
       ├──────────────────►│◄─────────────────────┤
       │                   │                      │
       │ 3. Real-time Chat │                      │
       │◄─────────────────►│◄────────────────────►│
       │    WebSocket Chat Room (Durable Object)  │
```

## 🔧 Technical Implementation

### 📋 WebSocket Room Strategy - **SIMPLE FORMAT**

**Room ID Format:** `support_{machineId}_{timestamp}`

**Client PeerID:** `client_{machineId}_{timestamp}`

**Admin PeerID:** `admin_{nickname}_{timestamp}`

**Ưu điểm:**

- ✅ Tích hợp với MachineID system hiện tại
- ✅ Dễ debug và identify participants
- ✅ Predictable format cho admin
- ✅ Không cần P2P signaling complexity

### 🗃️ Apps Script Schema Update

**SupportRequests Sheet - Columns:**

```
A: MachineID
B: ClientPeerID
C: RoomID
D: AdminPeerID
E: Status
F: AdminNickname
G: Timestamp
H: ConnectionStartTime
I: ChatHistory (JSON)
```

**Support Request JSON Format:**

```json
{
  "machineId": "abc123def456",
  "clientPeerID": "client_abc123_1704067200000",
  "roomID": "support_abc123_1704067200000",
  "adminPeerID": "admin_john_1704067300000",
  "status": "waiting|connected|ended",
  "adminNickname": "John",
  "timestamp": "2024-01-01T00:00:00Z",
  "connectionStartTime": "2024-01-01T00:05:00Z"
}
```

**Status Values:**

- `waiting` - Client đang chờ admin connect
- `connected` - Đang chat WebSocket
- `ended` - Đã hoàn thành và đóng kết nối

**ChatHistory Format (WebSocket Messages):**

```json
[
  {
    "from": "Client",
    "fromPeerID": "client_abc123_1704067200000",
    "text": "Xin chào, tôi cần hỗ trợ",
    "timestamp": "2024-01-01T00:00:00Z",
    "type": "chat-message"
  },
  {
    "from": "Admin John",
    "fromPeerID": "admin_john_1704067300000",
    "text": "Chào bạn, tôi có thể giúp gì?",
    "timestamp": "2024-01-01T00:01:00Z",
    "type": "chat-message"
  }
]
```

## 🔄 User Flow - Chi tiết từng bước

### 👤 Client Side Flow:

**Bước 1: Request Human Support**

```javascript
// User click "Gặp tư vấn viên" button
function requestHumanSupport() {
  const timestamp = Date.now();
  const roomID = `support_${machineId}_${timestamp}`;
  const clientPeerID = `client_${machineId}_${timestamp}`;

  // Gửi support request tới Workers
  const supportData = {
    roomID: roomID,
    clientPeerID: clientPeerID,
    timestamp: new Date().toISOString(),
    status: "waiting",
  };

  sendSupportRequestToWorkers(supportData);
  showWaitingUI(); // Hiển thị UI chờ admin
}
```

**Bước 2: Waiting State (3 phút timeout)**

- Hiển thị loading spinner với message "Đang chờ tư vấn viên..."
- Countdown timer 3 phút
- Chuẩn bị WebSocket connection

**Bước 3: WebSocket Connection Established**

```javascript
// Connect to WebSocket chat room
const ws = new WebSocket(
  `wss://your-worker.workers.dev/chat/room/${roomID}?peerID=${clientPeerID}&nickname=Client`
);

ws.onopen = () => {
  console.log("Connected to chat room!");
  hideWaitingUI();
  showWebSocketChatUI();
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleWebSocketMessage(message);
};
```

**Bước 4: WebSocket Chat Mode**

- Client chat real-time qua WebSocket
- Admin cũng kết nối vào cùng room
- Chat history được lưu tự động

### 👨‍💼 Admin Side Flow:

**Bước 1: Admin Dashboard Login**

```javascript
// Admin nhập nickname (không cần password)
function adminLogin(nickname) {
  localStorage.setItem("adminNickname", nickname);
  loadSupportRequests();
}
```

**Bước 2: Support Request List Management**

- **UI Layout:** Giống Messenger full-screen
- **Navigation Bar:**
  - Search box (tìm MachineID)
  - Refresh button (manual update)
- **Support Request List:**
  - Waiting: Xanh background
  - Connected: Vàng background
  - Ended: Xám background

**Bước 3: Connect to Client via WebSocket**

```javascript
function connectToClient(supportRequest) {
  const adminPeerID = `admin_${adminNickname}_${Date.now()}`;
  const roomID = supportRequest.roomID;

  // Connect to WebSocket chat room
  const ws = new WebSocket(
    `wss://your-worker.workers.dev/chat/room/${roomID}?peerID=${adminPeerID}&nickname=${adminNickname}`
  );

  ws.onopen = () => {
    updateSupportStatus(supportRequest.machineId, "connected", adminPeerID);
    startWebSocketChat(ws, supportRequest);
  };
}
```

**Bước 4: WebSocket Chat & History Management**

- Admin chat real-time với client qua WebSocket
- **Admin chịu trách nhiệm:**
  - Lưu chat history lên Apps Script
  - Đóng kết nối khi hoàn thành
  - Update status = "ended"

## ⚠️ Connection Management

### 🕐 Timeout Handling:

**Client Timeout (3 phút):**

```javascript
setTimeout(() => {
  if (!isWebSocketConnected) {
    showTimeoutMessage();
    ws.close();
    // Fallback to email/phone contact form
  }
}, 3 * 60 * 1000); // 3 minutes
```

**WebSocket Connection Monitoring:**

```javascript
// Durable Object cleanup - tự động sau 5 phút không hoạt động
// Apps Script function - kiểm tra abandoned support requests
function checkAbandonedSupportRequests() {
  const sheet = getSupportRequestsSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const [
      machineId,
      clientPeerID,
      roomID,
      adminPeerID,
      status,
      adminNickname,
      timestamp,
    ] = data[i];

    if (status === "waiting" || status === "connected") {
      const requestTime = new Date(timestamp);
      const now = new Date();

      // Auto-end after 30 minutes
      if (now - requestTime > 30 * 60 * 1000) {
        sheet.getRange(i + 1, 5).setValue("ended"); // Status column
      }
    }
  }
}
```

### 🎨 Admin UI Design:

**Layout:** Messenger-style full screen

```
┌─────────────────────────────────────────────────┐
│ [🔍 Search MachineID/Name] [🔄 Refresh]        │
├─────────────────────────────────────────────────┤
│ ⚪ vanced_abc123_xxx (waiting) - 2 min ago      │
│ 🔴 vanced_def456_xxx (warn) - 30 min ago       │
│ ⚪ vanced_ghi789_xxx (waiting) - 1 min ago      │
├─────────────────────────────────────────────────┤
│                Chat Area                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 📁 File Structure:

```
Human_Support/
├── websocket-chat-client.js    # Client WebSocket logic
├── admin-dashboard.js          # Admin UI + WebSocket logic
├── admin.html                  # Admin interface (Messenger-style)
├── websocket-utils.js          # Shared WebSocket utilities
└── styles/
    ├── admin-dashboard.css     # Admin UI styles
    └── websocket-chat.css      # WebSocket chat styles

WorkerSide-WranglerCLI/src/
├── worker.js                   # Main Workers logic + WebSocket routing
├── WebSocketChatRoom.js        # Durable Object for chat rooms
└── data.js                     # Tuned data for AI

SpreadSheet_Gs/
└── UserChatMng.gs             # Apps Script with support request management
```

## 🔄 Data Flow Summary:

### Phase 1: Support Request (Client → Apps Script)

```
Client click → Generate roomID → Workers → Apps Script (SupportRequests sheet)
```

### Phase 2: Discovery (Admin → Apps Script)

```
Admin refresh → Read SupportRequests → Display waiting clients
```

### Phase 3: WebSocket Connection (Admin + Client → Durable Object)

```
Admin select → WebSocket connect → Durable Object chat room ← Client WebSocket
```

### Phase 4: Real-time Chat (WebSocket + Admin saves to Apps Script)

```
Client ↔ Admin (WebSocket) → Admin saves → Apps Script (ChatHistory)
```

## 🎯 Key Implementation Points:

1. **WebSocket Rooms** dựa trên MachineID + timestamp
2. **Durable Objects** cho scalable real-time chat
3. **3 phút timeout** cho client waiting
4. **30 phút auto-end** cho abandoned sessions
5. **Admin responsibility** cho chat history management
6. **Messenger-style UI** cho admin dashboard
7. **Simple WebSocket** thay vì P2P complexity
8. **Apps Script integration** cho support request management

## 🚀 Implementation Status:

1. ✅ **WebSocket Durable Object** - WebSocketChatRoom.js completed
2. ✅ **Workers routing** - `/chat/room/{roomID}` endpoint
3. ✅ **Apps Script support** - Support request management functions
4. 📝 **Client WebSocket logic** - Need to implement
5. 📝 **Admin dashboard UI** - Need to update for WebSocket
6. 📝 **Timeout & cleanup systems** - Need to implement
7. 📝 **Chat history management** - Need to integrate with Apps Script

## 🔧 Technical Advantages:

- **No P2P complexity** - Simpler to implement and debug
- **Cloudflare Durable Objects** - Reliable, scalable WebSocket handling
- **Real-time chat** - Instant messaging without signaling overhead
- **Centralized history** - All chat data flows through Apps Script
- **Easy monitoring** - All connections visible in Durable Object logs
