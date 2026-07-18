import { ICON } from './icons.js';
import { esc } from './utils.js';

export function openModal(html, opts){
  opts = opts || {};
  const root = document.getElementById('modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  wrap._onBeforeClose = opts.onBeforeClose || null;
  wrap.addEventListener('click', e=>{ if(e.target === wrap) requestCloseModal(wrap); });
  root.appendChild(wrap);
  requestAnimationFrame(()=> wrap.classList.add('open'));
  return wrap;
}
export function closeModal(wrap){
  wrap.classList.remove('open');
  setTimeout(()=> wrap.remove(), 220);
}
export function requestCloseModal(wrap){
  if(wrap._onBeforeClose){ wrap._onBeforeClose(); }
  closeModal(wrap);
}
export function closeTopModal(){
  const overlays = document.querySelectorAll('#modalRoot .overlay');
  if(overlays.length) closeModal(overlays[overlays.length-1]);
}
export function requestCloseTopModal(){
  const overlays = document.querySelectorAll('#modalRoot .overlay');
  if(overlays.length) requestCloseModal(overlays[overlays.length-1]);
}
export function rerenderTopModal(html){
  const overlays = document.querySelectorAll('#modalRoot .overlay');
  if(!overlays.length) return;
  overlays[overlays.length-1].querySelector('.modal').innerHTML = html;
}

// ---- Popup xác nhận dùng chung: hỏi lại trước khi áp dụng thay đổi cho bản ghi cũ ----
let pendingConfirmAction = null;
export function openConfirmModal(title, message, onConfirm){
  pendingConfirmAction = onConfirm;
  const html = `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div class="modal-title">${esc(title)}</div>
      <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
    </div>
    <div class="modal-body">
      <div class="card">
        <div style="font-size:13.5px; color:var(--ink-soft); line-height:1.6;">${esc(message)}</div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-block" data-action="close-modal">Để sau</button>
      <button class="btn btn-primary btn-block" data-action="confirm-update">${ICON.check} Đồng ý cập nhật</button>
    </div>
  `;
  openModal(html, {});
}
export function takePendingConfirmAction(){
  const fn = pendingConfirmAction;
  pendingConfirmAction = null;
  return fn;
}

// Loading / empty / error state helpers (dùng chung cho mọi màn hình danh sách)
export function loadingSkeleton(rows){
  rows = rows || 3;
  let html = '';
  for(let i=0;i<rows;i++){
    html += `<div class="skeleton-row"><div class="skeleton-bar" style="width:60%;"></div><div class="skeleton-bar" style="width:38%;"></div></div>`;
  }
  return html;
}
export function emptyState(title, sub){
  return `<div class="empty-state">${ICON.empty}<div class="empty-state-title">${esc(title)}</div>
    <div class="empty-state-sub">${esc(sub||'')}</div></div>`;
}
export function errorBanner(message, opts){
  opts = opts || {};
  return `<div class="error-banner">${ICON.warn}
    <div><div>${esc(message)}</div>${opts.retryAction?`<button type="button" class="btn btn-danger-ghost btn-sm" data-action="${opts.retryAction}">Thử lại</button>`:''}</div>
  </div>`;
}
