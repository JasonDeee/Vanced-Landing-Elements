# Human Support System

_Cấu trúc dự án với dạng module logic dễ hiểu và dễ phát triển sau này._

## Mong muốn dự kiến:

Trong HTML đã có sẵn template box xác nhận "Chuyển hướng gặp tư vấn viên." hoặc "tiếp tục trò chuyện với Opus"
Tư vấn viên và người dùng sẽ chat với nhau thông qua **WebSocket real-time chat** (đã loại bỏ P2P/WebRTC complexity). Giao diện chat của tư vấn viên sẽ có thiết kế riêng.

## Luồng người dùng

- Sau khi người dùng xác nhận gặp tư vấn viên từ UI, Client sẽ tạo support request với thông tin cần thiết (machineId, roomID, clientPeerID) và gửi tới Workers.

- Tại Workers: Workers sẽ chuyển tiếp thông tin support request tới Apps Script thông qua `action=createSupportRequest`. Workers và Apps Script giao tiếp qua POST method với ctx.waitUntil() giống cơ chế hiện tại.

- Tại Apps Script: Nhận được support request, cập nhật cột SupportRequests sheet để lưu thông tin WebSocket chat (roomID, clientPeerID, status). Đồng thời gửi email thông báo tới admin. Email có nội dung: "Khách hàng [MachineID] đang yêu cầu hỗ trợ - Room: [roomID]".

- Client chuyển sang chế độ chờ kết nối WebSocket và hiển thị "Đang chờ tư vấn viên..."

## Luồng tư vấn viên (Admin side)

UI của màn hình Admin làm giống giao diện chat full màn hình của Messenger, có màu và style giống với màn của Client.

### Luồng 1: Khởi tạo ứng dụng chat và hiển thị danh sách client đang yêu cầu

- Khi tư vấn viên truy cập Admin Dashboard, họ sẽ fetch trực tiếp tới Apps Script để lấy danh sách support requests. Params: `action=getSupportRequests`, `page=1`.
- Apps Script đọc SupportRequests sheet, lấy các requests có status = "waiting", trả về danh sách kèm theo thông tin: machineId, roomID, clientPeerID, timestamp, chatHistory summary.

### Luồng 2: Admin lựa chọn MachineID và join WebSocket chat

- Admin chọn MachineID → Lấy roomID từ support request
- Tạo WebSocket connection tới `/chat/room/{roomID}` với adminPeerID
- Update Apps Script: `action=updateSupportConnection` với status = "connected"
- Bắt đầu real-time WebSocket chat (không cần P2P complexity)

### Connection Timeout:

Khi khách hàng đợi quá 3 phút kể từ khi xác nhận gặp tư vấn viên mà chưa có admin kết nối. Hệ thống sẽ hiển thị thông báo: "Có vẻ như chúng tôi chưa thể hỗ trợ bạn lúc này. Thành thật xin lỗi vì sự bất tiện này. Chúng tôi có thể liên hệ lại với bạn thông qua thông tin bạn cung cấp." Và hiển thị form thu thập: Email*, Tên*, Số điện thoại.

> Phần này sẽ cấu hình sau

## Technical Notes:

- **WebSocket Chat**: Sử dụng Cloudflare Durable Objects (WebSocketChatRoom) thay vì P2P
- **Real-time Communication**: Client ↔ Admin qua WebSocket `/chat/room/{roomID}`
- **Chat History**: Admin chịu trách nhiệm lưu chat history lên Apps Script
- **No P2P Complexity**: Loại bỏ hoàn toàn WebRTC/PeerJS để đơn giản hóa
- **Routing**: `/chat/room/{roomID}` cho WebSocket connections
