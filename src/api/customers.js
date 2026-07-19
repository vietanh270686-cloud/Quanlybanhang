import { supabase } from '../supabaseClient.js';

export async function getCustomer(id){
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).single();
  if(error) throw error;
  return data;
}
export async function createCustomer(fields){
  const { data, error } = await supabase.from('customers').insert(fields).select().single();
  if(error) throw error;
  return data;
}
export async function updateCustomer(id, patch){
  const { data, error } = await supabase.from('customers').update(patch).eq('id', id).select().single();
  if(error) throw error;
  return data;
}

export async function searchCustomersByName(query, limit){
  let q = supabase.from('customers').select('*').order('name').limit(limit||50);
  if(query) q = q.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
  const { data, error } = await q;
  if(error) throw error;
  return data||[];
}
