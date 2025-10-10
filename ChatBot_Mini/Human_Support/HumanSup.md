# human support

_trúc dự án với dạng module logic dễ hiểu và dễ phát triển sau này._

Mong muốn dự kiến:

Trong HTML đã có sẵn template box xác nhận "Chuyển hướng gặp tư vấn viên." hoặc "tiếp tục trò chuyện với Opus"
Tư vấn viên và người dùng sẽ chat với nhau p2p thông qua peerJS hoặc pure WebRTC. Giao diện chat của tư vấn viên sẽ có thiết kế riêng.

## Luồng người dùng

- Sau khi người dùng xác nhận gặp tư vấn viên từ UI, Phía Client sẽ tạo đầy đủ các thông tin để khởi tạo kết nối P2P sau đó gửi toàn bộ thông tin này tới Workers và chuyển sang chế độ chờ kết nối.

- Tại workers > Workers sẽ chuyển tiếp các thông tin này tới spreadsheet. Workers và Spreadsheet sẽ giao tiếp với nhau thông qua DoPost và Worker có ctx.waitUntil() giống như cớ chế hiện tại.

- Tại spreadsheet, nếu nhận được yêu cầu này, cập nhật giá trị của cột ConfirmedRealPersonRequest (cột I) để chứa các thông tin thiết lập p2p. Đồng thời sử dụng eMailservice gửi email thông báo tới email đặt sẵn. Hãy tạo một biến quy định Email này ở đầu file. Nội dung email trước mắt chỉ cần để dạng text cơ bản là "Khách hàng [MachineID] đang yêu cầu hỗ trợ".
  > To do: Có bao nhiêu tham số để khởi tạo được 1 kết nối p2p hoàn chỉnh; cần bao nhiêu ô để chứa các tham số này (một ô I có đủ không?);

## Luồng tư vấn viên (Admin side)

UI của màn hình Admin hãy làm giống giao diện chat full màn hình của Messenger, có màu và style giống với màn của Client.

### Luồng 1: khởi tạo ứng dụng chat và hiện thị danh sách các client đang yêu cầu.

- Khi tư vấn viên truy cập vào giao diện của họ (Gọi là Admin side - phía admin), họ sẽ fetch thẳng tới Spreadsheet (Không cần qua Workers nữa) để lấy thông tin các MachineID đang cần chat. Các params gửi đi bao gồm action=AdminChatRequest, NumOfClientRange = 1
  NumOfClientRange giống như kỹ thuật Pagination kết hợp với lazy load. Mỗi page bao gồm 20 khách hàng.

- Phía spreadsheet, chỉ cần đọc dữ liệu cột I (MachineID nào có dữ liệu cột I tức là đang yêu cầu tư vấn người thật), sau đó lên danh sách các MachineID đang cần hỗ trợ. Sau đó chọn theo NumOfCli để có được danh sách final. Cuối cùng, gửi danh sách MachineID đó kèm theo Summerize về phía Admin.

### Luồng 2: Admin lựa chọn một MachineID cụ thể và join vào trò chuyện

- Admin chọn MachineID → Lấy PeerID từ cột I
- Tạo admin PeerID → Connect P2P
- Update Spreadsheet: adminPeerID + status = "connected"
- Bắt đầu chat P2P real-time

### P2P Fail:

Là khi khác hàng đợi quá 3phút kể từ khi họ xác nhận gặp tư vấn. Lúc này chúng ta sẽ hiện một thông báo với nội dung "Có vẻ như chúng tôi chưa thể hỗ trợ bạn lúc này. Thành thật xin lỗi vì sự bất tiện này. Chúng tôi có thể liên hệ lại với bạn thông qua thông tin bạn cung cấp." Và hiện một box thông tin gồm Email*; Tên*; Số điện thoại.

> Phần này chúng ta sẽ cấu hình sau

## Note:

Note: Sau khi người dùng đã kết nối p2p thành công, phía Admin sẽ đảm nhiệm vai trò cập nhật lịch sử chat lên spreadsheet. Client không cần giao tiếp tới Workers nữa.
