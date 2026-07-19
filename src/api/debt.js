import { supabase } from '../supabaseClient.js';

// Không gõ tìm kiếm -> chỉ hiện những khách hàng/đối tác đang nợ (debt > 0).
// Có gõ tìm kiếm -> tìm trên TOÀN BỘ khách hàng/đối tác (kể cả chưa nợ đồng nào),
// để có thể chọn và ghi nhận công nợ mới cho họ.
export async function listDebtEntities(tab, query){
  const table = tab==='customer' ? 'customers' : 'partners';
  const q = (query||'').trim();
  if(q){
    let req = supabase.from(table).select('*').order('name').limit(50);
    req = table==='customers' ? req.or(`name.ilike.%${q}%,phone.ilike.%${q}%`) : req.ilike('name', `%${q}%`);
    const { data, error } = await req;
    if(error) throw error;
    return data||[];
  }
  const { data, error } = await supabase.from(table).select('*').gt('debt', 0).order('debt', { ascending:false });
  if(error) throw error;
  return data||[];
}

export async function getDebtGrandTotal(tab){
  const table = tab==='customer' ? 'customers' : 'partners';
  const { data, error } = await supabase.from(table).select('debt').gt('debt', 0);
  if(error) throw error;
  return (data||[]).reduce((s,r)=> s+(r.debt||0), 0);
}

export async function recordPayment(tab, entityId, amount, isoDate, before){
  const table = tab==='customer' ? 'customers' : 'partners';
  const newDebt = Math.max(0, before - amount);
  const { data: updated, error } = await supabase.from(table).update({ debt:newDebt }).eq('id', entityId).select().single();
  if(error) throw error;
  const { data: log, error: logErr } = await supabase.from('debt_log').insert({
    entity_type: tab, entity_id: entityId, log_type:'payment', amount, log_date: isoDate,
    note: `Thanh toán ${amount.toLocaleString('vi-VN')}₫ ngày ${isoDate}`,
  }).select().single();
  if(logErr) throw logErr;
  return { updated, log };
}
export async function revertPayment(tab, entityId, before, logId){
  const table = tab==='customer' ? 'customers' : 'partners';
  const { error } = await supabase.from(table).update({ debt:before }).eq('id', entityId);
  if(error) throw error;
  const { error: delErr } = await supabase.from('debt_log').delete().eq('id', logId);
  if(delErr) throw delErr;
}

export async function recordAdjustment(tab, entityId, newDebt, before){
  const table = tab==='customer' ? 'customers' : 'partners';
  const diff = newDebt - before;
  const { data: updated, error } = await supabase.from(table).update({ debt:newDebt }).eq('id', entityId).select().single();
  if(error) throw error;
  const { data: log, error: logErr } = await supabase.from('debt_log').insert({
    entity_type: tab, entity_id: entityId, log_type:'adjustment', amount: diff,
    note: `Điều chỉnh công nợ thành ${newDebt.toLocaleString('vi-VN')}₫`,
  }).select().single();
  if(logErr) throw logErr;
  return { updated, log };
}
export async function revertAdjustment(tab, entityId, before, logId){
  const table = tab==='customer' ? 'customers' : 'partners';
  const { error } = await supabase.from(table).update({ debt:before }).eq('id', entityId);
  if(error) throw error;
  const { error: delErr } = await supabase.from('debt_log').delete().eq('id', logId);
  if(delErr) throw delErr;
}
