# SpreadSheet

Chúng ta sẽ có một worksheet duy nhất.
worksheet có: 12 bảng cho mỗi tháng (Jan, Mar, Feb, v.v.)

## Sheet Tháng:

- Dùng để lưu trữ lịch sử chat của những khách hàng trong tháng đó. Mỗi máy tính của một khách hàng sẽ có một ID gọi là MachineID
- BackEnd chỉ cần quan tâm tới tháng hiện tại, ví dụ: Nếu user của tháng 08 đã chat 1 đoạn hội thoại thì khi họ truy cập vào ngày 01 tháng 08 thì UI không cần Load lịch sử chat của họ nữa. Nói cách khách khi khách hàng khởi tạo box chat, box chat chỉ cần tìm ID của khách đó có xuất hiện trong sheet của tháng hiện tại hay không là được. Nếu không hãy tạo mới.

- Sheet tháng sẽ có cấu trúc mỗi MachineID là một row
  | MachineID | IP | Conversation | Requested For Real Person (Boolean)| RPM info (Boolean) | RPD info (Number) | LastRequestTimeStamp | Summerize | ConfirmedRealPersonRequest |

Conversation sẽ có cấu trúc giống với phần message trong payload của model luôn (Để BE không cần phải xử lý lại thông tin khi gửi đi, chỉ cần gửi thẳng raw content của ô `Conversation`):
{
role: "user",
content: message,
},...

## Khởi tạo chat và xác thực hợp lệ (OnLoad)

- Giả sử có 1 khách hàng xử dụng địa chỉ IP xxx truy cập và có hành vi bất thường. Tôi không muốn chặn cả địa chỉ IP đó ngay từ đầu mà chỉ cần chặn máy tính của người dùng đó thôi. Nói cách khác là ban MachineID
- Tôi muốn có 2 loại ban: 1 là Ban theo MachineID và 2 là theo IP Address (nếu người phá hoại quá cứng đầu)

  > Todo: Hãy tư vấn cho tôi một số cấu trúc để tạo MachineID chính xác.

### BanForever:

- BanForever (Hoặc Ban cứng): Là lớp bảo mật đầu tiên, xác thực khi người dùng load trang (Khởi tạo chat) và xác thực cả trong khi người dùng chat.

- Phía Workers hãy tạo thêm một file.js nữa tương tự với Data.js nhưng là để lưu danh sách các MachineID và IP Address bị ban. Mục tiêu là Workers có thể phản ứng ngay với các địa chỉ bị ban mà không cần truy xuất về Spreadsheet. Danh sách bị ban sẽ do người dùng nhập thủ công vào đây.

### Logic khi khởi tạo chat

- Người dùng load trang > Gửi thông tin để Encode MachineID tới Workers > Workers check IP Address trước nếu không bị ban > Encode ra MachineID sau đó check MachineID có bị ban không
  - Nếu IP và MachineID không bị ban > Gửi MachineID tới Spreadsheet > Spreadsheet sẽ check machineID này đã có lịch sử chat chưa:
    - Đã có > Lấy lịch sử chat sau đó gửi về phía Client kèm theo MachineID > Hoàn tất khởi tạo (Thông báo về phía client hoàn thành khởi tạo, client Chỉ cần console.log là được)
    - Chưa có > vẫn gửi về phía Client MachineID và lịch sử chat rỗng; đồng thời Tạo row mới cho ID này với cột RPD là 15, cột RPM là false. > Hoàn tất khởi tạo
  - Nếu 1 trong 2 (IP hoặc MachineID) bị chặn > Phía client sẽ có thông báo trên màn hình "Thiết bị này không hợp lệ!" và hộp chat bị đóng băng. > Từ chối khởi tạo

## Chat Handling - Logic sự kiện chat (OnSubmit)

Sau Khi người dùng đã pass check & khởi tạo thành công box chat. Họ sẽ nhận được machineID

### Rate Limit:

- Rate Limit là lớp bảo mật thứ 2, xác thực trong khi người dùng chat.
- Tại đầu app script hãy tạo 2 const cho RPD = 15 và RPM = 1;

### Logic khi chat:

- Sau khi người dùng pass lớp bảo mật đầu tiên. Phía client đã nhận được MachineID.

- Khi người Submitchat (Gồm Message và MachineID) tới Workers > Workers check lớp bảo mật đầu tiên (BanForever) > nếu pass > gửi MachineID và Message của người dùng tới Spreadsheet> Spreadsheet check RPD và RPM của machine đó trước (RPD trước sau đó là RPM):

  Check cột LastRequestTimeStamp xem có phải ngày hôm qua hay không (Trước 23H 59 múi giờ Việt Nam)

  - nếu là hôm qua thì reset lại cột RPD về 15 và RPM về false; > _Pass RateCheck_ ...

  - Nếu là hôm nay thì check giá trị cột RPD:

    - Nếu RPD = 0 > Phía Client hiện thông báo "Chatbot hiện tại chỉ là bản thử nghiệm và bạn đã đạt ngưỡng 15 tin nhắn giới hạn mỗi ngày. Chúng tôi xin lỗi vì sự bất tiện này." và đóng băng UI.
    - Nếu RPD lớn hơn 0 > check RPM:
      - RPM = true thì client hiện thông báo "Bạn đang nhắn quá nhanh, chúng tôi đặt giới hạn ở 01 tin nhắn mỗi phút" & đóng băng UI.
      - RPM = false > _Pass RateCheck_ ...

- Khi _Pass RateCheck_: Trừ đi một RPD và đặt RPM của MachineID này về true (Đồng thời đặt setimeout 1phút cho RPM tự set về false) > Spreadsheet response về Workers request hợp lệ và Workers fetch tới model sau đó trả về tin nhắn cho người dùng.
  > Lưu ý: Spreadsheet response về Workers trước sau đó mới Set timeout

# Tổng kết: Một luồng người dùng hoàn chỉnh sẽ trải qua 2 giai đoạn.

Giai đoạn khởi tạo chat: check BanForever, check lịch sử chat > trả lịch sử chat & MachineID về cho người dùng.

- Client Input: Hash Info
- Client Output: [Valid; Invalid]; MachineID

Giai đoạn chat: Tiếp tục check BanForever > Check RateLimit > xử lý tin nhắn

- Client Input: MachineID; Message
- Client Output: [Valid; Invalid]; Response Message
