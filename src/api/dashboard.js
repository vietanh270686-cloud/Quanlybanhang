import { supabase } from '../supabaseClient.js';
import { todayStr } from '../utils.js';

async function countRows(table, filters){
  let q = supabase.from(table).select('*', { count:'exact', head:true });
  if(filters) q = filters(q);
  const { count, error } = await q;
  if(error) throw error;
  return count || 0;
}

// Đơn nháp rỗng (mở popup khách hàng/đối tác nhưng chưa thêm sản phẩm) không tính là
// "đơn đang chờ" — chỉ đếm đơn hôm nay, chưa chốt, và có tổng tiền > 0.
async function countNonEmptyOrdersToday(table, linesRelation, priceCol){
  const { data, error } = await supabase
    .from(table)
    .select(`id, ${linesRelation}(qty, ${priceCol})`)
    .eq('order_date', todayStr())
    .eq('status', 'moi');
  if(error) throw error;
  return (data||[]).filter(o => (o[linesRelation]||[]).reduce((s,l)=> s + l.qty*l[priceCol], 0) > 0).length;
}

export async function getHomeCounts(){
  const [
    products, customers, partners,
    soToday, poToday, demandOpen,
    debtCustomers, debtPartners,
  ] = await Promise.all([
    countRows('products'),
    countRows('customers'),
    countRows('partners'),
    countNonEmptyOrdersToday('sales_orders', 'sales_order_lines', 'sell_price'),
    countNonEmptyOrdersToday('purchase_orders', 'purchase_order_lines', 'import_price'),
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
