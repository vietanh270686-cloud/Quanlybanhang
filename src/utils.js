// "Hôm nay" theo giờ Việt Nam (UTC+7), không phải giờ UTC của máy chủ/trình duyệt —
// quanh nửa đêm giờ VN, ngày UTC vẫn là hôm qua nên phải dịch giờ trước khi lấy ngày.
export function todayStr(){ return new Date(Date.now() + 7*60*60*1000).toISOString().slice(0,10); }
export function fmtVND(n){ return Math.round(n||0).toLocaleString('vi-VN') + '₫'; }
export function fmtDate(d){ return new Date(d).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}); }
export function timeAgo(d){
  const diffMs = Date.now() - new Date(d).getTime();
  const h = diffMs/3600000;
  if(h<1) return 'vừa xong';
  if(h<24) return Math.floor(h)+' giờ trước';
  const days = Math.floor(h/24);
  return days+' ngày trước';
}
export function isToday(d){
  const x = new Date(d), n = new Date();
  return x.getFullYear()===n.getFullYear() && x.getMonth()===n.getMonth() && x.getDate()===n.getDate();
}
export function esc(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function fmtDateInputToVN(isoDate){
  if(!isoDate) return '';
  const [y,m,d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
// m.me/<id> hay bị Facebook chặn với trang cá nhân (không phải Page) -> dùng thẳng link
// trang cá nhân, người dùng tự bấm "Nhắn tin" trong Facebook — luôn vào đúng người.
export function facebookProfileUrl(facebookId){
  const id = (facebookId||'').trim();
  return /^\d+$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : `https://www.facebook.com/${id}`;
}
// Trì hoãn tìm kiếm cho tới khi ngừng gõ ms mili-giây — tránh gọi Supabase liên tục theo từng phím.
export function debounce(fn, ms){
  let timer = null;
  return function(...args){
    if(timer) clearTimeout(timer);
    timer = setTimeout(()=>fn(...args), ms);
  };
}
