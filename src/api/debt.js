import { supabase } from '../supabaseClient.js';

export async function listDebtEntities(tab){
  const table = tab==='customer' ? 'customers' : 'partners';
  const { data, error } = await supabase.from(table).select('*').gt('debt', 0).order('debt', { ascending:false });
  if(error) throw error;
  return data||[];
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
