import { supabase } from '../supabaseClient.js';

const todayStr = () => new Date().toISOString().slice(0,10);

export async function getOrCreateDraftSO(customerId){
  const { data: existing, error: findErr } = await supabase
    .from('sales_orders').select('*')
    .eq('customer_id', customerId).eq('status','moi').eq('order_date', todayStr())
    .maybeSingle();
  if(findErr) throw findErr;
  if(existing) return existing;
  const { data, error } = await supabase
    .from('sales_orders').insert({ customer_id:customerId, order_date: todayStr(), status:'moi' }).select().single();
  if(error) throw error;
  return data;
}

export async function listSOLines(salesOrderId){
  const { data, error } = await supabase
    .from('sales_order_lines')
    .select('*, products(id, name, sell_price_retail, sell_price_wholesale, import_price, stock_qty), partners(id, name)')
    .eq('sales_order_id', salesOrderId)
    .order('id');
  if(error) throw error;
  return data||[];
}

export async function addSOLine(fields){
  const { data, error } = await supabase.from('sales_order_lines').insert(fields)
    .select('*, products(id, name, sell_price_retail, sell_price_wholesale, import_price, stock_qty), partners(id, name)').single();
  if(error) throw error;
  return data;
}
export async function updateSOLine(lineId, patch){
  const { data, error } = await supabase.from('sales_order_lines').update(patch).eq('id', lineId)
    .select('*, products(id, name, sell_price_retail, sell_price_wholesale, import_price, stock_qty), partners(id, name)').single();
  if(error) throw error;
  return data;
}
export async function deleteSOLine(lineId){
  const { error } = await supabase.from('sales_order_lines').delete().eq('id', lineId);
  if(error) throw error;
}

export async function createPendingDemand(fields){
  const { error } = await supabase.from('pending_demand').insert(fields);
  if(error) throw error;
}
export async function updatePendingDemandQty(salesOrderLineId, qty){
  const { error } = await supabase.from('pending_demand').update({ qty }).eq('sales_order_line_id', salesOrderLineId);
  if(error) throw error;
}

export async function cancelSalesOrder(id){
  const { data: lines, error: lineErr } = await supabase.from('sales_order_lines').select('id').eq('sales_order_id', id);
  if(lineErr) throw lineErr;
  const lineIds = (lines||[]).map(l=>l.id);
  if(lineIds.length){
    const { error: demErr } = await supabase.from('pending_demand').update({ status:'cancelled' }).in('sales_order_line_id', lineIds).eq('status','open');
    if(demErr) throw demErr;
  }
  const { error } = await supabase.from('sales_orders').update({ status:'cancelled' }).eq('id', id);
  if(error) throw error;
}
export async function closeSalesOrder(id){
  const { error } = await supabase.from('sales_orders').update({ status:'closed' }).eq('id', id);
  if(error) throw error;
}

export async function listSalesOrders(){
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*, customers(id, name, phone, facebook_id), sales_order_lines(*, products(id, name))')
    .order('created_at', { ascending:false })
    .limit(200);
  if(error) throw error;
  return data||[];
}

export async function getSalesOrder(id){
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*, customers(id, name), sales_order_lines(*, products(id, name), partners(id, name))')
    .eq('id', id).single();
  if(error) throw error;
  return data;
}

export function orderTotal(order){
  return order.sales_order_lines.reduce((s,l)=> s + l.qty*l.sell_price, 0);
}
export function orderLineProfit(l){ return (l.sell_price - l.import_price_at_sale) * l.qty; }
export function orderProfit(order){
  return order.sales_order_lines.reduce((s,l)=> s + orderLineProfit(l), 0);
}
