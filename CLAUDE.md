# Sổ Bán Hàng — Mỹ Phẩm & Đồ Gia Dụng

App quản lý bán hàng / nhập hàng / công nợ cho 1 cửa hàng (1 người dùng, chủ shop).
Ban đầu là demo HTML/JS 1 file (`so-ban-hang-demo.html`, không còn dùng), đã được port
sang Vite + vanilla JS (không framework) + Supabase (Postgres + Auth) trong phiên làm
việc này. Deploy tĩnh lên GitHub Pages.

- Repo: `vietanh270686-cloud/Quanlybanhang` (GitHub)
- Live: https://vietanh270686-cloud.github.io/Quanlybanhang/
- Deploy: GitHub Actions (`.github/workflows/deploy.yml`) build + deploy lên Pages mỗi khi push `main`.
  Cần 2 secret trong repo Settings → Secrets → Actions: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Local dev: `npm run dev` (Vite). `vite.config.js` có `base: '/Quanlybanhang/'` (khớp tên repo).
- Git identity máy này: Viet Anh / vietanh270686@gmail.com. Không có `gh` CLI cài sẵn —
  khi cần tạo PR, dùng GitHub API qua `curl` với token lấy từ `git credential fill`
  (protocol=https, host=github.com), ghi payload JSON ra file rồi `curl --data-binary @file`
  (tránh lỗi escape shell với tiếng Việt/dấu ngoặc kép). Trên Windows/git-bash, `python.exe`
  không hiểu path `/tmp` của bash — dùng path Windows thật (`/c/Users/...`) khi cần cross giữa
  bash và python.

## KHÔNG có quyền truy vấn Supabase trực tiếp

Claude không có DB access tự động — mọi migration/DDL đều phải giao file `.sql` cho user
tự chạy trong Supabase SQL Editor (thường lưu ở `~/Downloads`). Khi cần xem dữ liệu thật để
debug, viết sẵn câu SELECT rồi nhờ user chạy + dán kết quả lại.

## Cấu trúc thư mục

```
src/
  main.js              # event dispatcher toàn cục (click delegation), khởi động auth
  auth.js              # màn đăng nhập (Supabase Auth email+password)
  home.js              # màn hình chính: search tổng hợp + icon + dashboard counts
  modal.js             # openModal/rerenderTopModal/openConfirmModal/loadingSkeleton/emptyState/errorBanner
  toast.js             # showToast (có undo, tự ẩn sau 6-7s)
  icons.js             # SVG icon inline dùng chung
  utils.js             # fmtVND/fmtDate/esc/debounce/facebookProfileUrl...
  supabaseClient.js    # supabase client + findByExactName (check trùng tên)
  style.css            # toàn bộ CSS (không dùng CSS module/framework)

  products.js / productsMenu.js         # popup Sản phẩm + menu tìm & danh sách
  customers.js / customersMenu.js       # popup Khách hàng (kèm đơn bán nháp) + menu
  partners.js / partnersMenu.js         # popup Đối tác (kèm đơn mua nháp) + menu
  salesOrdersScreen.js                  # màn "Đơn bán" (P1 ngày+tìm KH+tổng ngày, P2 list)
  purchaseOrdersScreen.js                # màn "Hàng nhập" (P1 ngày+tìm đối tác+tổng, P2 list)
  debtScreen.js                          # màn "Quản lý công nợ" (tab KH/Đối tác + tìm + P2/P3)
  warehouseScreen.js                     # màn "Kho hàng"
  restockModal.js                        # popup "Nhập hàng" (mở từ dòng đơn bán thiếu tồn)

  api/*.js             # 1 file/entity, bọc các lệnh gọi supabase-js (products, customers,
                         partners, salesOrders, purchaseOrders, debt, dashboard, search)
```

Không có router, không có framework — mọi "màn hình" là 1 modal bottom-sheet (`openModal`),
render bằng template string + `innerHTML`, gắn lại event listener sau mỗi lần render
(`wireInputs()` pattern lặp lại ở mọi file).

## Database (Supabase Postgres, đã bật RLS)

12 bảng: `products, customers, partners, partner_contacts, partner_prices, sales_orders,
sales_order_lines, purchase_orders, purchase_order_lines, pending_demand, stock_log, debt_log`.

Cột quan trọng bổ sung ngoài thiết kế gốc (đọc code là thấy, không cần nhớ hết):
`products.stock_qty`, `customers.facebook_id`, `partners.facebook_id`.

RLS: mọi bảng chỉ cho `auth.role() = 'authenticated'` (1 user, không phân quyền).

### Các Postgres function (RPC) — LUÔN xem file mới nhất, không phải file cũ hơn cùng tên hàm

Nhiều file `.sql` trong Downloads là các bản `create or replace` NỐI TIẾP nhau của CÙNG
1 hàm. Bản đúng/mới nhất hiện tại:

- **`close_sales_order(so_id)`** — định nghĩa mới nhất nằm trong `tru-ton-kho-khi-chot-don-ban.sql`.
  Khi chốt đơn bán: cộng nợ khách hàng (nếu tổng > 0) + ghi `debt_log`, **trừ `products.stock_qty`**
  cho các dòng `source_type='kho'`, rồi set `status='closed'`. Có guard `status <> 'moi' → return`
  (an toàn nếu bấm chốt 2 lần).
- **`close_purchase_order(po_id)`** — định nghĩa mới nhất nằm trong `cong-ton-kho-khi-chot-don-mua.sql`.
  Khi chốt đơn mua: khớp `pending_demand` (bù thiếu/nhập dư/nhập bổ sung → `stock_log`), upsert
  `partner_prices`, cập nhật `products.import_price`, **cộng `products.stock_qty`** theo từng dòng,
  cộng nợ đối tác + ghi `debt_log`, set `status='closed'`. Cùng guard chống chốt trùng.

Nếu cần sửa 2 hàm này, viết lại TOÀN BỘ thân hàm (không patch từng phần) và giao file `.sql`
mới cho user chạy — không giả định user còn nhớ đã chạy đúng thứ tự các file cũ.

## Business logic bắt buộc giữ đúng (dễ làm sai khi sửa)

1. **Giá lẻ/sỉ**: `customers.customer_type` = `le`/`si` quyết định lấy `sell_price_retail` hay
   `sell_price_wholesale` khi thêm dòng vào đơn bán. Đổi loại khách giữa chừng → tính lại giá
   toàn bộ dòng đang có (xem `setCustomerType` trong `customers.js`).
2. **Chỉ bắt buộc Tên** khi tạo Sản phẩm/Khách hàng/Đối tác — các trường khác tuỳ chọn.
3. **Chỉ tạo mới khi bấm rõ nút "Tạo mới"** (Sản phẩm/Khách hàng/Đối tác) — đóng popup bằng
   cách khác (backdrop, nút X, Hủy đơn) sẽ bỏ dở hoàn toàn, KHÔNG tự lưu. Đây là hành vi đã
   được **đổi ngược** so với bản demo gốc (demo gốc: gõ Tên rồi đóng popup vẫn tự lưu) — không
   quay lại hành vi cũ.
4. **Cảnh báo trùng tên** (không chặn cứng) khi tạo mới — dùng `findByExactName()` trong
   `supabaseClient.js`, nếu trùng thì `openConfirmModal` hỏi lại trước khi tạo.
5. **Sửa bản ghi cũ**: áp dụng ngay, không hỏi xác nhận — thay bằng toast có nút "Hoàn tác"
   (~6s). Hoàn tác = ghi đè lại giá trị cũ (không xoá bản ghi, vì đã persist thật).
6. **Chỉ hỏi xác nhận (Có/Không)** ở 2 chỗ: Hủy đơn (bán hoặc mua), và công nợ/thanh toán
   vượt **2.000.000đ** (`DEBT_CONFIRM_THRESHOLD` trong `debtScreen.js`).
7. **Đơn nháp (status='moi') không giới hạn theo ngày tạo** — `getOrCreateDraftSO`/
   `getOrCreateDraftPO` tìm đơn 'moi' gần nhất của khách/đối tác đó bất kể ngày, rồi TỰ CẬP
   NHẬT `order_date` về hôm nay nếu khác — để đơn chưa chốt không bị "kẹt" ở ngày cũ khi mở lại.
8. **`todayStr()` dùng UTC** (`new Date().toISOString().slice(0,10)`), KHÔNG phải giờ Việt Nam
   (UTC+7). Từ 00:00–07:00 giờ VN, ngày UTC vẫn là hôm qua → có thể gây lệch ngày nếu user thao
   tác khung giờ này. Đây là nguyên nhân nghi vấn khi user báo "thiếu dữ liệu ngày X" — luôn kiểm
   tra khoảng ngày X-1 → X+1 khi debug, không chỉ đúng ngày X.
9. **1 sản phẩm chỉ hiện 1 dòng trong đơn bán/đơn mua** — thêm sản phẩm đã có sẵn trong đơn
   sẽ cộng dồn số lượng vào dòng đó, không tạo dòng mới (xem `soAddLine`/`poAddLine`).
10. **Cơ chế khớp cầu–cung (pending_demand)**: hiện KHÔNG còn đường nào tạo `source_type='partner'`
    cho dòng đơn bán mới (quick-add trong popup Khách hàng chỉ còn nguồn "Trong kho"), nên
    `pending_demand` mới sẽ không phát sinh nữa từ luồng bán hàng thông thường. Cơ chế/hàm liên
    quan (banner gợi ý ở popup Đối tác, khớp trong `close_purchase_order`) vẫn giữ nguyên, chỉ
    không còn nguồn tạo mới — không xoá code này trừ khi được yêu cầu rõ.
11. **Nhập hàng (restock) từ popup Sản phẩm / popup Khách hàng KHÔNG cộng thẳng vào
    `stock_qty` nữa** — khi có chọn đối tác, gọi `addToPartnerDraftOrder()` (api/purchaseOrders.js)
    để THÊM/CỘNG DỒN vào đơn mua nháp (chờ duyệt) của đối tác đó. Tồn kho chỉ thực sự tăng khi
    đơn đó được chốt ở màn "Hàng nhập" (qua `close_purchase_order`). Ngoại lệ: sửa "Số lượng
    trong kho" khi KHÔNG chọn đối tác (trong `restockModal.js`) vẫn là sửa `stock_qty` ngay lập
    tức (coi như đối chiếu/sửa sai số thủ công, không phải một giao dịch mua).
12. **Kho hàng chặn sửa `stock_qty` thấp hơn số đang "giữ chỗ"** cho các dòng đơn bán
    `source_type='kho'` thuộc đơn `status='moi'` (chưa chốt) — xem `getPendingKhoQtyMap()`.
13. **Facebook**: không dùng `m.me/<id>` (hay bị chặn với trang cá nhân) — dùng
    `facebookProfileUrl()` trong `utils.js` (mở đúng trang cá nhân, tự bấm Nhắn tin). Khi mở
    cửa sổ Zalo/Facebook, PHẢI gọi `window.open()` đồng bộ (trước mọi `await`), nếu không nhiều
    trình duyệt di động sẽ chặn popup vì mất "user gesture".
14. **Nội dung bill** (copy clipboard) có kèm STK ngân hàng: `1282666675 — BIDV, Chi nhánh
    Tràng Tiền, Hà Nội` (xem `BANK_INFO` trong `salesOrdersScreen.js`).

## Quy ước UI

- Modal **cao cố định** (92vh mobile / 86vh desktop), không co giãn theo nội dung — chỉ
  `.modal-body` cuộn bên trong (xem `.modal`/`.modal-body` trong `style.css`).
- Ô tìm kiếm luôn nằm trong 1 `.card` riêng, tách khỏi danh sách kết quả bên dưới.
- Debounce 1s cho ô tìm kiếm CÓ gọi Supabase (home, công nợ, tìm đối tác trong popup Sản
  phẩm/Nhập hàng, 4 menu Sản phẩm/Khách hàng/Đối tác/Kho hàng). Ô tìm kiếm CHỈ lọc mảng đã
  tải sẵn (quick-add trong popup Khách hàng/Đối tác) KHÔNG debounce — không có chi phí mạng
  nên thêm độ trễ chỉ làm chậm vô ích.
- Màn "Đơn bán"/"Hàng nhập": cấu trúc P1 (1 card: ngày sửa được mặc định hôm nay + ô tìm
  theo khách hàng/đối tác trong ngày đó + số liệu tổng ngày) + P2 (danh sách lọc theo P1).

## Thứ tự & trạng thái các file SQL đã giao cho user (thư mục Downloads của user)

Nếu user báo lỗi liên quan tới cột/hàm không tồn tại, khả năng cao là chưa chạy đủ các file
này theo đúng thứ tự — hỏi lại user đã chạy file nào:

1. `bat-rls.sql` — bật RLS + policy cho 12 bảng.
2. `them-cot-ton-kho.sql` — thêm `products.stock_qty`.
3. `them-cot-facebook-id.sql` — thêm `customers.facebook_id`, `partners.facebook_id`.
4. `nhap-du-lieu-KH-tam.sql` — import dữ liệu thật ban đầu (sản phẩm/khách hàng/đối tác) từ
   file Excel của user, đã trích Facebook ID từ link.
5. `cap-nhat-cong-no-hoi-to-hom-nay.sql` — **chỉ chạy 1 lần** (backfill công nợ hồi tố cho các
   đơn đã chốt trước khi có cơ chế tự động cộng nợ — không chạy lại).
6. `tru-ton-kho-khi-chot-don-ban.sql` — bản `close_sales_order` MỚI NHẤT (xem mục Postgres function ở trên).
7. `cong-ton-kho-khi-chot-don-mua.sql` — bản `close_purchase_order` MỚI NHẤT (xem mục Postgres function ở trên).

(File `dong-don-mua-function.sql` và `cong-no-tu-dong-khi-chot-don.sql` là các bản CŨ của
2 hàm trên, đã bị thay thế — không cần chạy lại, chỉ còn giá trị lịch sử.)

## Quy trình làm việc đã thống nhất với user

- User đồng ý cho **tự động commit + push sau mỗi phần xong** (không cần hỏi xác nhận từng lần) —
  xác nhận từ phiên trước, vẫn nên dùng phán đoán nếu thay đổi có rủi ro cao.
- PR #1 (`feature/explicit-create-duplicate-warning` → `main`) đã merge. Từ nay làm việc
  trực tiếp trên `main` (push `main` là live ngay qua GitHub Actions) — không tạo nhánh
  feature riêng nữa trừ khi user yêu cầu.
- Mọi thay đổi DB (cột mới, hàm mới) đều phải giao file `.sql` riêng, đặt tên rõ mục đích,
  và nói rõ cho user: chạy 1 lần hay an toàn chạy lại nhiều lần.

## Việc đang dang dở (tại thời điểm ghi file này)

Đang chờ user chạy `kiem-tra-du-lieu-19-07.sql` (SELECT thuần, không sửa gì) và gửi lại kết
quả để xác định vì sao "Hàng nhập" báo thiếu dữ liệu ngày 19/07/2026 — nghi do lệch UTC/giờ VN
(mục 8 ở trên) hoặc do đơn bị hủy/chưa merge đúng vào đơn nháp chung.
