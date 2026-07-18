import { supabase } from '../supabaseClient.js';

async function countRows(table, filters){
  let q = supabase.from(table).select('*', { count:'exact', head:true });
  if(filters) q = filters(q);
  const { count, error } = await q;
  if(error) throw error;
  return count || 0;
}

const todayStr = () => new Date().toISOString().slice(0,10);

export async function getHomeCounts(){
  const [
    products, customers, partners,
    soToday, poToday, demandOpen,
    debtCustomers, debtPartners,
  ] = await Promise.all([
    countRows('products'),
    countRows('customers'),
    countRows('partners'),
    countRows('sales_orders', q=>q.eq('order_date', todayStr()).eq('status','moi')),
    countRows('purchase_orders', q=>q.eq('order_date', todayStr()).eq('status','moi')),
    countRows('pending_demand', q=>q.eq('status','open')),
    countRows('customers', q=>q.gt('debt', 0)),
    countRows('partners', q=>q.gt('debt', 0)),
  ]);
  return {
    products, customers, partners,
    soToday, poToday, demandOpen,
    debtTotalCount: debtCustomers + debtPartners,
  };
}
