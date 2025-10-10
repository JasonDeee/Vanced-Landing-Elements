# Human Support System - Structure & Implementation Guide

## 🎯 Tổng quan hệ thống

Hệ thống Human Support sử dụng **P2P WebRTC** để kết nối trực tiếp giữa Client và Admin, với **PeerJS** làm signaling server.

### 🏗️ Kiến trúc tổng thể:

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Client    │    │ PeerJS Server│    │   Admin     │
│   (User)    │    │ (Signaling)  │    │ (Advisor)   │
└─────────────┘    └──────────────┘    └─────────────┘
       │                   │                   │
       │ 1. Custom PeerID  │                   │
       ├──────────────────►│                   │
       │ ◄─────────────────┤                   │
       │   "ID registered" │                   │
       │                   │                   │
       │ 2. Lưu PeerID → Spreadsheet           │
       ├───────────────────┼──────────────────►│
       │                   │                   │
       │                   │ 3. Admin đọc list│
       │                   │ ◄─────────────────┤
       │                   │                   │
       │                   │ 4. connect(peerID)│
       │                   │ ◄─────────────────┤
       │ ◄─────────────────┤                   │
       │ 5. P2P Connected  │                   │
       │◄─────────────────────────────────────►│
       │        Direct Chat                    │
```

## 🔧 Technical Implementation

### 📋 PeerID Strategy - **CUSTOM FORMAT**

**Format:** `vanced_{machineId}_{timestamp}`

**Ví dụ:** `vanced_abc123def456_1704067200000`

**Ưu điểm:**

- ✅ Tích hợp với MachineID system hiện tại
- ✅ Dễ debug và identify client
- ✅ Predictable format cho admin
- ✅ Có thể reconnect với cùng ID

### 🗃️ Spreadsheet Schema Update

**Cột I (ConfirmedRealPersonRequest) - JSON Format:**

```json
{
  "clientPeerID": "vanced_abc123_1704067200000",
  "adminPeerID": "admin_john_1704067300000",
  "status": "waiting|connected|closed|warn",
  "adminNickname": "John",
  "timestamp": "2024-01-01T00:00:00Z",
  "connectionStartTime": "2024-01-01T00:05:00Z"
}
```

**Status Values:**

- `waiting` - Client đang chờ admin connect
- `connected` - Đang chat P2P
- `closed` - Đã hoàn thành và đóng kết nối
- `warn` - Admin quên đóng kết nối (>25 phút)

**Cột Conversation - Enhanced Format:**

```json
[
  { "role": "user", "content": "Tôi cần hỗ trợ" },
  { "role": "assistant", "content": "Tôi sẽ chuyển bạn sang tư vấn viên" },
  { "role": "user", "content": "[RealPersonSaid] User: Xin chào admin!" },
  {
    "role": "assistant",
    "content": "[RealPersonSaid] Admin(John): Chào bạn, tôi có thể giúp gì?"
  }
]
```

## 🔄 User Flow - Chi tiết từng bước

### 👤 Client Side Flow:

**Bước 1: Request Human Support**

```javascript
// User click "Gặp tư vấn viên" button
function requestHumanSupport() {
  // Tạo custom PeerID
  const peerID = `vanced_${machineId}_${Date.now()}`;

  // Khởi tạo PeerJS
  const peer = new Peer(peerID);

  peer.on("open", (id) => {
    // Gửi request tới Workers → Spreadsheet
    sendP2PRequestToWorkers(id);
    showWaitingUI(); // Hiển thị UI chờ admin
  });
}
```

**Bước 2: Waiting State (3 phút timeout)**

- Hiển thị loading spinner với message "Đang chờ tư vấn viên..."
- Countdown timer 3 phút
- Listen for admin connection

**Bước 3: P2P Connection Established**

```javascript
peer.on("connection", (conn) => {
  console.log("Admin connected!");
  hideWaitingUI();
  showP2PChatUI();
  handleP2PChat(conn);
});
```

**Bước 4: P2P Chat Mode**

- Client chỉ chat P2P, không gửi tới Workers nữa
- Admin đảm nhiệm việc lưu chat history lên Spreadsheet

### 👨‍💼 Admin Side Flow:

**Bước 1: Admin Dashboard Login**

```javascript
// Admin nhập nickname (không cần password)
function adminLogin(nickname) {
  localStorage.setItem("adminNickname", nickname);
  loadClientList();
}
```

**Bước 2: Client List Management**

- **UI Layout:** Giống Messenger full-screen
- **Navigation Bar:**
  - Search box (tìm MachineID/tên khách hàng)
  - Refresh button (manual update)
- **Client List:**
  - Normal: Trắng background
  - Warning: Đỏ background (quên đóng kết nối >25 phút)

**Bước 3: Connect to Client**

```javascript
function connectToClient(clientPeerID) {
  const adminID = `admin_${adminNickname}_${Date.now()}`;
  const adminPeer = new Peer(adminID);

  adminPeer.on("open", () => {
    const conn = adminPeer.connect(clientPeerID);
    conn.on("open", () => {
      updateSpreadsheetStatus(clientPeerID, "connected", adminID);
      startP2PChat(conn);
    });
  });
}
```

**Bước 4: P2P Chat & History Management**

- Admin chat trực tiếp với client
- **Admin chịu trách nhiệm:**
  - Lưu tất cả messages lên Spreadsheet
  - Đóng kết nối khi hoàn thành
  - Update status = "closed"

## ⚠️ Connection Management

### 🕐 Timeout Handling:

**Client Timeout (3 phút):**

```javascript
setTimeout(() => {
  if (!isConnected) {
    showTimeoutMessage();
    peer.destroy();
    // Fallback to email/phone contact
  }
}, 3 * 60 * 1000); // 3 minutes
```

**Admin Warning System (25 phút):**

```javascript
// Apps Script function - chạy định kỳ
function checkAbandonedConnections() {
  const sheet = getOrCreateMonthSheet(getCurrentMonthSheet());
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const confirmData = data[i][8]; // Cột I
    if (confirmData) {
      const parsed = JSON.parse(confirmData);
      const lastRequest = new Date(data[i][6]); // LastRequestTimeStamp
      const now = new Date();

      if (
        now - lastRequest > 25 * 60 * 1000 &&
        parsed.status !== "closed" &&
        parsed.status !== "warn"
      ) {
        parsed.status = "warn";
        sheet.getRange(i + 1, 9).setValue(JSON.stringify(parsed));
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
├── client-p2p.js          # Client P2P logic
├── admin-dashboard.js     # Admin UI + P2P logic
├── admin.html            # Admin interface (Messenger-style)
├── p2p-utils.js          # Shared utilities
└── styles/
    ├── admin-dashboard.css # Admin UI styles
    └── p2p-chat.css       # P2P chat styles
```

## 🔄 Data Flow Summary:

### Phase 1: Request (Client → Spreadsheet)

```
Client click → Generate PeerID → Workers → Spreadsheet (cột I)
```

### Phase 2: Discovery (Admin → Spreadsheet)

```
Admin refresh → Read cột I → Display waiting clients
```

### Phase 3: Connection (Admin → Client via PeerJS)

```
Admin select → PeerJS connect → P2P established
```

### Phase 4: Chat (P2P Direct + Admin saves to Spreadsheet)

```
Client ↔ Admin (P2P) → Admin saves → Spreadsheet (Conversation)
```

## 🎯 Key Implementation Points:

1. **Custom PeerID** dựa trên MachineID
2. **Manual refresh** cho admin dashboard (không realtime)
3. **3 phút timeout** cho client waiting
4. **25 phút warning** cho abandoned connections
5. **Admin responsibility** cho chat history management
6. **Messenger-style UI** cho admin dashboard
7. **Status tracking** với warn system

## 🚀 Next Steps:

1. Implement client P2P logic
2. Create admin dashboard UI
3. Add P2P chat functionality
4. Implement timeout & warning systems
5. Add chat history management
6. Testing & optimization
