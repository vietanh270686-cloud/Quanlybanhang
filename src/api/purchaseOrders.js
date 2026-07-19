import { supabase } from '../supabaseClient.js';

const todayStr = () => new Date().toISOString().slice(0,10);

// Đơn nháp (chưa chốt) của đối tác này — không giới hạn theo ngày, vì đơn chưa chốt
// luôn được coi là "đơn của hôm nay" cho tới khi chốt xong, dù đã tạo từ hôm trước.
export async function getOrCreateDraftPO(partnerId){
  const { data: existing, error: findErr } = await supabase
    .from('purchase_orders').select('*')
    .eq('partner_id', partnerId).eq('status','moi')
    .order('created_at', { ascending:false }).limit(1)
    .maybeSingle();
  if(findErr) throw findErr;
  if(existing){
    if(existing.order_date === todayStr()) return existing;
    const { data: rolled, error: rollErr } = await supabase
      .from('purchase_orders').update({ order_date: todayStr() }).eq('id', existing.id).select().single();
    if(rollErr) throw rollErr;
    return rolled;
  }
  const { data, error } = await supabase
    .from('purchase_orders').insert({ partner_id:partnerId, order_date: todayStr(), status:'moi' }).select().single();
  if(error) throw error;
  return data;
}

export async function listPOLines(poId){
  const { data, error } = await supabase
    .from('purchase_order_lines')
    .select('*, products(id, name)')
    .eq('purchase_order_id', poId)
    .order('id');
  if(error) throw error;
  return data||[];
}
export async function addPOLine(fields){
  const { data, error } = await supabase.from('purchase_order_lines').insert(fields)
    .select('*, products(id, name)').single();
  if(error) throw error;
  return data;
}
export async function updatePOLine(lineId, patch){
  const { data, error } = await supabase.from('purchase_order_lines').update(patch).eq('id', lineId)
    .select('*, products(id, name)').single();
  if(error) throw error;
  return data;
}
export async function deletePOLine(lineId){
  const { error } = await supabase.from('purchase_order_lines').delete().eq('id', lineId);
  if(error) throw error;
}

export async function cancelPurchaseOrder(id){
  const { error } = await supabase.from('purchase_orders').update({ status:'cancelled' }).eq('id', id);
  if(error) throw error;
}

// Chốt đơn mua — chạy trong 1 Postgres function để đảm bảo đúng khi thao tác đồng thời.
// Trả về danh sách dòng có chênh lệch so với gợi ý (để hiển thị cảnh báo).
export async function closePurchaseOrder(id){
  const { data, error } = await supabase.rpc('close_purchase_order', { po_id: id });
  if(error) throw error;
  return data||[];
}

export async function listTodayPurchaseOrders(){
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, partners(id, name), purchase_order_lines(*, products(id, name))')
    .eq('order_date', todayStr())
    .order('created_at', { ascending:false });
  if(error) throw error;
  return data||[];
}
export async function getPurchaseOrder(id){
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, partners(id, name), purchase_order_lines(*, products(id, name))')
    .eq('id', id).single();
  if(error) throw error;
  return data;
}

export async function aggregatedDemandForPartner(partnerId){
  const { data, error } = await supabase
    .from('pending_demand')
    .select('product_id, qty, products(name)')
    .eq('partner_id', partnerId).eq('status','open');
  if(error) throw error;
  const map = {};
  (data||[]).forEach(d=>{
    if(!map[d.product_id]) map[d.product_id] = { productId:d.product_id, productName:d.products?.name, qty:0 };
    map[d.product_id].qty += d.qty;
  });
  return map;
}

export function poTotal(order){
  return order.purchase_order_lines.reduce((s,l)=> s + l.qty*l.import_price, 0);
}
