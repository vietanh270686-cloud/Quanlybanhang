import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);

// Kiểm tra trùng tên (không phân biệt hoa/thường) trước khi tạo mới — chỉ để CẢNH BÁO,
// không chặn cứng, vì có thể có 2 khách/đối tác/sản phẩm trùng tên hợp lệ.
export async function findByExactName(table, name){
  const trimmed = (name||'').trim();
  if(!trimmed) return null;
  const { data, error } = await supabase.from(table).select('id, name').ilike('name', trimmed).limit(1);
  if(error) throw error;
  return (data && data[0]) || null;
}
