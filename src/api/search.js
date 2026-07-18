import { supabase } from '../supabaseClient.js';

export async function searchAll(q){
  q = (q||'').trim();
  if(!q) return { products:[], customers:[], partners:[] };
  const like = `%${q}%`;
  const [productsRes, customersRes, partnersRes] = await Promise.all([
    supabase.from('products').select('*').ilike('name', like).order('name').limit(20),
    supabase.from('customers').select('*').or(`name.ilike.${like},phone.ilike.${like}`).order('name').limit(20),
    supabase.from('partners').select('*').ilike('name', like).order('name').limit(20),
  ]);
  if(productsRes.error) throw productsRes.error;
  if(customersRes.error) throw customersRes.error;
  if(partnersRes.error) throw partnersRes.error;
  return {
    products: productsRes.data || [],
    customers: customersRes.data || [],
    partners: partnersRes.data || [],
  };
}
