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

  const products = productsRes.data || [];
  let partnerByProduct = {};
  if(products.length){
    const ids = products.map(p=>p.id);
    const { data: pp, error: ppErr } = await supabase
      .from('partner_prices')
      .select('product_id, price, quoted_at, partners(name)')
      .in('product_id', ids)
      .order('quoted_at', { ascending:false });
    if(ppErr) throw ppErr;
    (pp||[]).forEach(r=>{
      if(!partnerByProduct[r.product_id]) partnerByProduct[r.product_id] = { partnerName:r.partners?.name, price:r.price };
    });
  }

  return {
    products: products.map(p=>({ ...p, latestPartner: partnerByProduct[p.id]||null })),
    customers: customersRes.data || [],
    partners: partnersRes.data || [],
  };
}
