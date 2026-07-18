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
