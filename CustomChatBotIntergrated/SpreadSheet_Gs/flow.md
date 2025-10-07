# User Flow Diagram - Chat System với Rate Limiting & Ban System

## 🔄 **Tổng quan 2 giai đoạn:**

### **Giai đoạn 1: Khởi tạo Chat (OnLoad)**

- Input: Browser Fingerprint
- Output: [Valid/Invalid] + MachineID + Chat History

### **Giai đoạn 2: Chat Handling (OnSubmit)**

- Input: MachineID + Message
- Output: [Valid/Invalid] + Response Message

---

## 📋 **GIAI ĐOẠN 1: KHỞI TẠO CHAT (OnLoad)**

```mermaid
flowchart TD
    A[User Load Page] --> B[Generate Browser Fingerprint]
    B --> C[Send to Workers]
    C --> D{Workers: Check IP Ban}

    D -->|IP Banned| E[❌ Show: "Thiết bị này không hợp lệ!"]
    E --> F[🔒 Freeze Chat UI]

    D -->|IP OK| G[Generate MachineID from Fingerprint]
    G --> H{Workers: Check MachineID Ban}

    H -->|MachineID Banned| E

    H -->|MachineID OK| I[Send MachineID to Spreadsheet]
    I --> J{Spreadsheet: Check MachineID exists in current month}

    J -->|Exists| K[Get Chat History]
    K --> L[Return: MachineID + Chat History]

    J -->|New User| M[Create New Row]
    M --> N[Set: RPD=15, RPM=false]
    N --> O[Return: MachineID + Empty History]

    L --> P[✅ Client: Initialize Chat Success]
    O --> P
    P --> Q[Console.log: "Chat initialized"]
```

### **Chi tiết Spreadsheet Logic (Giai đoạn 1):**

```
IF MachineID exists in current month sheet:
    RETURN {
        status: "existing_user",
        machineID: machineID,
        chatHistory: conversation_data,
        rpd: current_rpd,
        rpm: current_rpm
    }
ELSE:
    CREATE new row with:
        - MachineID: machineID
        - IP: user_ip
        - Conversation: []
        - RequestedForRealPerson: false
        - RPM: false
        - RPD: 15
        - LastRequestTimeStamp: current_timestamp

    RETURN {
        status: "new_user",
        machineID: machineID,
        chatHistory: [],
        rpd: 15,
        rpm: false
    }
```

---

## 💬 **GIAI ĐOẠN 2: CHAT HANDLING (OnSubmit)**

```mermaid
flowchart TD
    A[User Submit Message] --> B[Send: MachineID + Message to Workers]
    B --> C{Workers: Check BanForever}

    C -->|Banned| D[❌ Show: "Thiết bị này không hợp lệ!"]
    D --> E[🔒 Freeze Chat UI]

    C -->|Not Banned| F[Send to Spreadsheet: MachineID + Message]
    F --> G{Spreadsheet: Check LastRequestTimeStamp}

    G -->|Yesterday| H[Reset: RPD=15, RPM=false]
    H --> I{Check RPD > 0?}

    G -->|Today| I{Check RPD > 0?}

    I -->|RPD = 0| J[❌ Show: "Đã đạt ngưỡng 15 tin nhắn/ngày"]
    J --> K[🔒 Freeze Chat UI]

    I -->|RPD > 0| L{Check RPM = false?}

    L -->|RPM = true| M[❌ Show: "Đang nhắn quá nhanh, 1 tin nhắn/phút"]
    M --> N[🔒 Freeze Chat UI]

    L -->|RPM = false| O[✅ Pass Rate Check]
    O --> P[RPD = RPD - 1]
    P --> Q[Set RPM = true]
    Q --> R[Response to Workers: "Valid Request"]
    R --> S[Workers: Call OpenRouter API]
    S --> T[Return Bot Response to Client]
    T --> U[Update Conversation in Spreadsheet]
    U --> V[Set Timeout: RPM = false after 1 minute]
```

### **Chi tiết Spreadsheet Logic (Giai đoạn 2):**

```javascript
// Timezone: GMT+7 (Vietnam)
const now = new Date();
const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
const lastRequest = new Date(lastRequestTimeStamp);

// Check if last request was yesterday (before 23:59 Vietnam time)
const isYesterday = vietnamTime.toDateString() !== lastRequest.toDateString();

IF isYesterday:
    SET RPD = 15
    SET RPM = false

// Rate limiting checks
IF RPD === 0:
    RETURN {
        status: "rate_limited_daily",
        message: "Chatbot hiện tại chỉ là bản thử nghiệm và bạn đã đạt ngưỡng 15 tin nhắn giới hạn mỗi ngày. Chúng tôi xin lỗi vì sự bất tiện này."
    }

IF RPM === true:
    RETURN {
        status: "rate_limited_minute",
        message: "Bạn đang nhắn quá nhanh, chúng tôi đặt giới hạn ở 01 tin nhắn mỗi phút"
    }

// Pass all checks
SET RPD = RPD - 1
SET RPM = true
SET LastRequestTimeStamp = current_timestamp

// Set timeout for RPM reset (1 minute)
setTimeout(() => {
    SET RPM = false
}, 60000);

RETURN {
    status: "valid",
    message: "Request approved"
}
```

---

## 🗂️ **Spreadsheet Structure:**

### **Sheet Names:** `Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`, `Nov`, `Dec`

### **Columns:**

| A         | B   | C            | D                      | E   | F   | G                    |
| --------- | --- | ------------ | ---------------------- | --- | --- | -------------------- |
| MachineID | IP  | Conversation | RequestedForRealPerson | RPM | RPD | LastRequestTimeStamp |

### **Data Types:**

- **MachineID**: String (16 chars hash)
- **IP**: String (IPv4/IPv6)
- **Conversation**: JSON String (Array of {role, content})
- **RequestedForRealPerson**: Boolean
- **RPM**: Boolean (Rate Per Minute flag)
- **RPD**: Number (Rate Per Day counter, max 15)
- **LastRequestTimeStamp**: ISO DateTime String

---

## 🚫 **Ban System:**

### **BanForever Lists (Workers/BanList.js):**

```javascript
export const BANNED_IPS = ["192.168.1.100", "10.0.0.50"];

export const BANNED_MACHINE_IDS = ["abc123def456789a", "xyz789abc123def4"];
```

### **Check Points:**

1. **OnLoad**: Check IP → Check MachineID
2. **OnSubmit**: Check IP → Check MachineID → Rate Limiting

---

## ⚙️ **Constants:**

```javascript
const RPD_LIMIT = 15; // Messages per day
const RPM_LIMIT = 1; // Messages per minute
const TIMEZONE_OFFSET = 7; // GMT+7 Vietnam
```
