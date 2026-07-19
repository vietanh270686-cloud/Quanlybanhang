import { supabase } from '../supabaseClient.js';

export async function getPartner(id){
  const { data, error } = await supabase.from('partners').select('*, partner_contacts(seq, name, phone)').eq('id', id).single();
  if(error) throw error;
  return data;
}
export async function createPartner(fields){
  const { data, error } = await supabase.from('partners').insert(fields).select().single();
  if(error) throw error;
  return data;
}
export async function updatePartner(id, patch){
  const { data, error } = await supabase.from('partners').update(patch).eq('id', id).select().single();
  if(error) throw error;
  return data;
}
export async function upsertPartnerContact(partnerId, seq, { name, phone }){
  const { error } = await supabase.from('partner_contacts')
    .upsert({ partner_id:partnerId, seq, name, phone }, { onConflict:'partner_id,seq' });
  if(error) throw error;
}

export async function searchPartnersFull(query, limit){
  let q = supabase.from('partners').select('*').order('name').limit(limit||50);
  if(query) q = q.ilike('name', `%${query}%`);
  const { data, error } = await q;
  if(error) throw error;
  return data||[];
}
