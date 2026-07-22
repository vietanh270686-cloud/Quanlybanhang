import { supabase } from '../supabaseClient.js';

// Doanh thu + lãi/lỗ của các đơn bán ĐÃ CHỐT trong khoảng ngày [fromDate, toDate] (yyyy-mm-dd),
// gộp theo từng ngày — Báo cáo chỉ tính đơn đã chốt thành công, không tính đơn nháp/đã huỷ,
// đúng nguyên tắc "tra cứu chỉ hiện đơn đã thành công" đã áp dụng ở Đơn bán/Đơn nhập.
export async function getRevenueProfitByRange(fromDate, toDate){
  const { data, error } = await supabase
    .from('sales_orders')
    .select('order_date, sales_order_lines(qty, sell_price, import_price_at_sale)')
    .eq('status', 'closed')
    .gte('order_date', fromDate)
    .lte('order_date', toDate);
  if(error) throw error;
  const byDate = {};
  (data||[]).forEach(o=>{
    const day = byDate[o.order_date] || (byDate[o.order_date] = { date:o.order_date, revenue:0, profit:0 });
    (o.sales_order_lines||[]).forEach(l=>{
      day.revenue += l.qty * l.sell_price;
      day.profit += l.qty * (l.sell_price - (l.import_price_at_sale||0));
    });
  });
  return Object.values(byDate).sort((a,b)=> a.date.localeCompare(b.date));
}

// Top sản phẩm bán chạy (theo số lượng) trong khoảng ngày, chỉ tính đơn đã chốt.
export async function getTopSellingProducts(fromDate, toDate, limit=10){
  const { data, error } = await supabase
    .from('sales_orders')
    .select('sales_order_lines(product_id, qty, sell_price, products(name))')
    .eq('status', 'closed')
    .gte('order_date', fromDate)
    .lte('order_date', toDate);
  if(error) throw error;
  const byProduct = {};
  (data||[]).forEach(o=>{
    (o.sales_order_lines||[]).forEach(l=>{
      if(!l.product_id) return;
      const row = byProduct[l.product_id] || (byProduct[l.product_id] = {
        productId:l.product_id, name:l.products?.name || '(sản phẩm đã xoá)', qty:0, revenue:0,
      });
      row.qty += l.qty;
      row.revenue += l.qty * l.sell_price;
    });
  });
  return Object.values(byProduct).sort((a,b)=> b.qty - a.qty).slice(0, limit);
}

// Tổng quan nhanh: công nợ khách hàng/đối tác đang có + giá trị tồn kho + số sản phẩm âm —
// đúng công thức "chỉ tính sản phẩm dương vào tổng tiền tồn kho" đã áp dụng ở Kho hàng.
export async function getDebtAndStockOverview(){
  const [custR, partR, prodR] = await Promise.all([
    supabase.from('customers').select('debt').gt('debt', 0),
    supabase.from('partners').select('debt').gt('debt', 0),
    supabase.from('products').select('stock_qty, import_price'),
  ]);
  if(custR.error) throw custR.error;
  if(partR.error) throw partR.error;
  if(prodR.error) throw prodR.error;

  const customerDebtCount = custR.data.length;
  const customerDebtTotal = custR.data.reduce((s,r)=> s+(r.debt||0), 0);
  const partnerDebtCount = partR.data.length;
  const partnerDebtTotal = partR.data.reduce((s,r)=> s+(r.debt||0), 0);

  let stockValue = 0, negativeCount = 0;
  (prodR.data||[]).forEach(p=>{
    if(p.stock_qty > 0) stockValue += p.stock_qty * (p.import_price||0);
    if(p.stock_qty < 0) negativeCount += 1;
  });

  return { customerDebtCount, customerDebtTotal, partnerDebtCount, partnerDebtTotal, stockValue, negativeCount };
}

// Gộp danh sách đơn hàng + lịch sử debt_log thành 1 dòng thời gian, kèm số dư công nợ SAU mỗi
// dòng. LƯU Ý QUAN TRỌNG: vì `customers.debt`/`partners.debt` chỉ lưu số dư HIỆN TẠI (không phải
// 1 sổ cái có sẵn số dư từng thời điểm), số dư từng dòng ở đây được SUY NGƯỢC từ công nợ hiện tại
// qua toàn bộ debt_log của khách/đối tác đó (giả định debt_log ghi đầy đủ MỌI thay đổi công nợ —
// kể cả lúc chốt đơn cộng nợ, đúng theo mô tả nghiệp vụ đã thống nhất — không chỉ thanh toán/điều
// chỉnh). Nếu có thay đổi công nợ nào đó KHÔNG được ghi vào debt_log, số dư hiển thị ở các dòng cũ
// hơn sẽ bị lệch — cần đối chiếu thực tế sau khi dùng thử.
function buildEntityTimeline({ orders, orderAmountFn, logs, currentDebt, fromDate, toDate }){
  const logEvents = (logs||[]).map(l=>({
    kind:'log', date: l.log_date || (l.created_at||'').slice(0,10), raw:l,
    // payment luôn làm giảm nợ; adjustment cộng/trừ đúng bằng "amount" (đã là hiệu số khi ghi);
    // các log_type khác (vd phát sinh khi chốt đơn) giả định luôn làm TĂNG nợ.
    effect: l.log_type==='payment' ? -Math.abs(l.amount||0)
          : l.log_type==='adjustment' ? (l.amount||0)
          : (l.amount||0),
  })).filter(e=>e.date);
  logEvents.sort((a,b)=> a.date.localeCompare(b.date) || (a.raw.id||0)-(b.raw.id||0));

  let running = currentDebt||0;
  for(let i=logEvents.length-1; i>=0; i--){
    logEvents[i].balanceAfter = running;
    running -= logEvents[i].effect;
  }
  const openingBalance = running;

  const logsInRange = logEvents.filter(e=> e.date>=fromDate && e.date<=toDate);
  const orderEvents = (orders||[]).map(o=>({ kind:'order', date:o.order_date, id:o.id, amount: orderAmountFn(o) }));

  const priorLogs = logEvents.filter(e=> e.date < fromDate);
  let carryBalance = priorLogs.length ? priorLogs[priorLogs.length-1].balanceAfter : openingBalance;

  const merged = [...orderEvents, ...logsInRange].sort((a,b)=> a.date.localeCompare(b.date));
  // Khớp 1-1 mỗi đơn hàng với dòng "Điều chỉnh công nợ" tự động phát sinh CÙNG NGÀY, CÙNG SỐ
  // TIỀN (do close_sales_order/close_purchase_order ghi — xem ghi chú dưới) để đơn hàng hiển
  // thị đúng số dư SAU KHI đơn đó cộng nợ, thay vì số dư ngay trước nó trong danh sách đã sắp xếp.
  const usedLogIds = new Set();
  const rows = merged.map(e=>{
    if(e.kind==='log'){
      carryBalance = e.balanceAfter;
      return { ...e, balanceAfter: e.balanceAfter };
    }
    const match = logsInRange.find(l=> l.raw.log_type==='adjustment' && l.date===e.date
      && Math.abs((l.effect||0) - e.amount) < 1 && !usedLogIds.has(l.raw.id));
    if(match){ usedLogIds.add(match.raw.id); return { ...e, balanceAfter: match.balanceAfter }; }
    return { ...e, balanceAfter: carryBalance };
  });
  // Chỉ HIỂN THỊ đơn hàng đã chốt + thanh toán thực tế — ẩn dòng "Điều chỉnh công nợ" khỏi
  // danh sách (dữ liệu thực tế cho thấy log_type='adjustment' chính là cách hàm chốt đơn tự
  // ghi nợ, trùng khớp 1-1 với dòng đơn hàng ngay bên cạnh — hiện cả 2 trông như tăng nợ 2 lần).
  // Vẫn dùng đủ các dòng "adjustment" này để tính đúng số dư luỹ kế ở trên trước khi lọc bỏ,
  // nên số "Công nợ sau dòng này" của các dòng còn lại vẫn chính xác.
  const visibleRows = rows.filter(r=> r.kind==='order' || r.raw.log_type==='payment');
  // Hiển thị gần nhất trước (xa nhất cuối) — số dư từng dòng đã tính xong ở bước trên nên
  // đảo thứ tự ở đây không ảnh hưởng tới độ chính xác, chỉ đổi thứ tự hiển thị.
  visibleRows.reverse();

  return { rows: visibleRows, openingBalance: priorLogs.length ? priorLogs[priorLogs.length-1].balanceAfter : openingBalance };
}

// Lịch sử mua hàng + công nợ của 1 khách hàng trong khoảng ngày — đơn bán đã chốt +
// thanh toán/điều chỉnh công nợ, kèm số dư công nợ sau mỗi dòng (xem ghi chú ở buildEntityTimeline).
export async function getCustomerHistory(customerId, fromDate, toDate){
  const [ordersRes, logsRes, custRes] = await Promise.all([
    supabase.from('sales_orders')
      .select('id, order_date, sales_order_lines(qty, sell_price)')
      .eq('customer_id', customerId).eq('status', 'closed')
      .gte('order_date', fromDate).lte('order_date', toDate)
      .order('order_date'),
    supabase.from('debt_log').select('*').eq('entity_type', 'customer').eq('entity_id', customerId),
    supabase.from('customers').select('id, name, debt').eq('id', customerId).single(),
  ]);
  if(ordersRes.error) throw ordersRes.error;
  if(logsRes.error) throw logsRes.error;
  if(custRes.error) throw custRes.error;

  const timeline = buildEntityTimeline({
    orders: ordersRes.data||[],
    orderAmountFn: o=> (o.sales_order_lines||[]).reduce((s,l)=> s+l.qty*l.sell_price, 0),
    logs: logsRes.data||[],
    currentDebt: custRes.data.debt||0,
    fromDate, toDate,
  });
  return { entityName: custRes.data.name, currentDebt: custRes.data.debt||0, ...timeline };
}

// Lịch sử mua hàng + công nợ của 1 đối tác trong khoảng ngày — đơn nhập đã chốt +
// thanh toán/điều chỉnh công nợ, kèm số dư công nợ sau mỗi dòng (xem ghi chú ở buildEntityTimeline).
export async function getPartnerHistory(partnerId, fromDate, toDate){
  const [ordersRes, logsRes, partRes] = await Promise.all([
    supabase.from('purchase_orders')
      .select('id, order_date, purchase_order_lines(qty, import_price)')
      .eq('partner_id', partnerId).eq('status', 'closed')
      .gte('order_date', fromDate).lte('order_date', toDate)
      .order('order_date'),
    supabase.from('debt_log').select('*').eq('entity_type', 'partner').eq('entity_id', partnerId),
    supabase.from('partners').select('id, name, debt').eq('id', partnerId).single(),
  ]);
  if(ordersRes.error) throw ordersRes.error;
  if(logsRes.error) throw logsRes.error;
  if(partRes.error) throw partRes.error;

  const timeline = buildEntityTimeline({
    orders: ordersRes.data||[],
    orderAmountFn: o=> (o.purchase_order_lines||[]).reduce((s,l)=> s+l.qty*l.import_price, 0),
    logs: logsRes.data||[],
    currentDebt: partRes.data.debt||0,
    fromDate, toDate,
  });
  return { entityName: partRes.data.name, currentDebt: partRes.data.debt||0, ...timeline };
}
