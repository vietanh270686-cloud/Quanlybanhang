import { supabase } from '../supabaseClient.js';

export async function getProduct(id){
  const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
  if(error) throw error;
  return data;
}
export async function createProduct(fields){
  const { data, error } = await supabase.from('products').insert(fields).select().single();
  if(error) throw error;
  return data;
}
export async function updateProduct(id, patch){
  const { data, error } = await supabase.from('products').update(patch).eq('id', id).select().single();
  if(error) throw error;
  return data;
}
export async function deleteProduct(id){
  const { error } = await supabase.from('products').delete().eq('id', id);
  if(error) throw error;
}

// Lịch sử đối tác từng bán sản phẩm này, gần nhất trước
export async function getPartnerHistoryForProduct(productId){
  const { data, error } = await supabase
    .from('partner_prices')
    .select('partner_id, price, quoted_at, partners(id, name)')
    .eq('product_id', productId)
    .order('quoted_at', { ascending:false });
  if(error) throw error;
  return (data||[]).map(r=>({ partnerId:r.partner_id, price:r.price, date:r.quoted_at, partnerName:r.partners?.name }));
}
export async function getLatestPartnerForProduct(productId){
  const hist = await getPartnerHistoryForProduct(productId);
  return hist.length ? hist[0] : null;
}
export async function getPartnerPrice(partnerId, productId){
  const { data, error } = await supabase
    .from('partner_prices').select('*').eq('partner_id', partnerId).eq('product_id', productId).maybeSingle();
  if(error) throw error;
  return data ? { price:data.price, date:data.quoted_at } : null;
}
export async function setPartnerPrice(partnerId, productId, price){
  const { error } = await supabase.from('partner_prices')
    .upsert({ partner_id:partnerId, product_id:productId, price, quoted_at:new Date().toISOString() });
  if(error) throw error;
}
export async function deletePartnerPrice(partnerId, productId){
  const { error } = await supabase.from('partner_prices').delete().eq('partner_id', partnerId).eq('product_id', productId);
  if(error) throw error;
}

// Sản phẩm gần nhất một đối tác từng bán cho mình
export async function getProductHistoryForPartner(partnerId){
  const { data, error } = await supabase
    .from('partner_prices')
    .select('product_id, price, quoted_at, products(id, name)')
    .eq('partner_id', partnerId)
    .order('quoted_at', { ascending:false });
  if(error) throw error;
  return (data||[]).map(r=>({ productId:r.product_id, price:r.price, date:r.quoted_at, productName:r.products?.name }));
}

export async function searchPartnersByName(query){
  let q = supabase.from('partners').select('id, name').order('name').limit(30);
  if(query) q = q.ilike('name', `%${query}%`);
  const { data, error } = await q;
  if(error) throw error;
  return data||[];
}

export async function searchProductsByName(query, limit){
  let q = supabase.from('products').select('*').order('name').limit(limit||50);
  if(query) q = q.ilike('name', `%${query}%`);
  const { data, error } = await q;
  if(error) throw error;
  return data||[];
}

// Đối tác gần nhất cho MỖI sản phẩm (dùng cho gợi ý "Đặt từ đối tác" ở Thêm sản phẩm nhanh)
export async function getLatestPartnerPricesMap(){
  const { data, error } = await supabase
    .from('partner_prices')
    .select('product_id, partner_id, price, quoted_at, partners(name)')
    .order('quoted_at', { ascending:false });
  if(error) throw error;
  const map = {};
  (data||[]).forEach(r=>{
    if(!map[r.product_id]) map[r.product_id] = { partnerId:r.partner_id, partnerName:r.partners?.name, price:r.price, date:r.quoted_at };
  });
  return map;
}

// Giá nhập gần nhất cho MỖI sản phẩm (không quan tâm đối tác nào) — dùng cho dòng đơn bán
export async function getLatestImportPriceMap(){
  const { data, error } = await supabase
    .from('partner_prices')
    .select('product_id, price, quoted_at')
    .order('quoted_at', { ascending:false });
  if(error) throw error;
  const map = {};
  (data||[]).forEach(r=>{ if(map[r.product_id]===undefined) map[r.product_id] = r.price; });
  return map;
}

// Giá nhập trung bình theo MỖI sản phẩm, tính trên mọi lần nhập của mọi đối tác — dùng cho Kho hàng
export async function getAvgImportPriceMap(){
  const { data, error } = await supabase.from('partner_prices').select('product_id, price');
  if(error) throw error;
  const sums = {};
  (data||[]).forEach(r=>{
    if(!sums[r.product_id]) sums[r.product_id] = { total:0, count:0 };
    sums[r.product_id].total += r.price;
    sums[r.product_id].count += 1;
  });
  const map = {};
  Object.keys(sums).forEach(pid=>{ map[pid] = Math.round(sums[pid].total/sums[pid].count); });
  return map;
}

// Danh sách sản phẩm cho màn Kho hàng: không gõ tìm kiếm -> chỉ sản phẩm còn tồn;
// có gõ tìm kiếm -> toàn bộ sản phẩm khớp tên (kể cả đã hết hàng) để chủ động cập nhật lại tồn kho.
export async function listWarehouseProducts(query){
  let q = supabase.from('products').select('*').order('name');
  if(query) q = q.ilike('name', `%${query}%`);
  else q = q.gt('stock_qty', 0);
  const { data, error } = await q;
  if(error) throw error;
  return data||[];
}

// Số lượng mỗi sản phẩm đang nằm trong các đơn bán CHƯA CHỐT (nguồn "Trong kho") —
// dùng để chặn sửa tồn kho ở màn Kho hàng xuống thấp hơn số đang giữ chỗ cho đơn chờ chốt.
export async function getPendingKhoQtyMap(){
  const { data, error } = await supabase
    .from('sales_order_lines')
    .select('product_id, qty, sales_orders!inner(status)')
    .eq('source_type', 'kho')
    .eq('sales_orders.status', 'moi');
  if(error) throw error;
  const map = {};
  (data||[]).forEach(r=>{ map[r.product_id] = (map[r.product_id]||0) + r.qty; });
  return map;
}
