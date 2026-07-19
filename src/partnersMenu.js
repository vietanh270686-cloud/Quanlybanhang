import { ICON } from './icons.js';
import { esc } from './utils.js';
import { openModal, rerenderTopModal, loadingSkeleton, errorBanner } from './modal.js';
import { searchPartnersFull } from './api/partners.js';
import { openPartnerModal } from './partners.js';

let wrap = null;
let query = '';
let items = null;
let itemsError = null;

export async function openPartnerMenu(){
  query = ''; items = null; itemsError = null;
  wrap = openModal(menuHtml());
  wireSearch();
  await load();
}

async function load(){
  const myQuery = query;
  try{
    items = await searchPartnersFull(query);
    if(myQuery !== query) return;
    itemsError = null;
  } catch(err){
    if(myQuery !== query) return;
    itemsError = err;
  }
  if(wrap?.isConnected){ rerenderTopModal(menuHtml()); wireSearch(); }
}

function menuHtml(){
  return `
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Đối tác</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body">
      <div class="search-box" style="margin-bottom:10px;">${ICON.search}<input id="ptm-search" placeholder="Gõ tên đối tác để tìm…" value="${esc(query)}" autocomplete="off"></div>
      <div class="add-new-row" data-action="ptm-add-new">${ICON.plus} Thêm đối tác mới</div>
      <div id="ptm-list">${listHtml()}</div>
    </div>
  `;
}
function listHtml(){
  if(items===null) return loadingSkeleton(4);
  if(itemsError) return errorBanner('Không tải được danh sách đối tác — kiểm tra lại kết nối mạng.', { retryAction:'ptm-retry' });
  if(!items.length) return `<div class="no-results">Không tìm thấy đối tác phù hợp.</div>`;
  return items.map(p=>`<div class="result-row" data-action="ptm-open" data-id="${p.id}">
    <div class="result-icon" style="background:var(--doitac-bg); color:var(--doitac);">${ICON.truck}</div>
    <div class="result-main">
      <div class="result-title">${esc(p.name)}</div>
      <div class="result-sub">${esc(p.address||'Chưa có địa chỉ')}</div>
    </div>
  </div>`).join('');
}
function wireSearch(){
  const input = wrap.querySelector('#ptm-search');
  if(!input) return;
  input.addEventListener('input', e=>{
    query = e.target.value;
    wrap.querySelector('#ptm-list').innerHTML = loadingSkeleton(2);
    load();
  });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

export function handlePartnerMenuAction(action, el){
  switch(action){
    case 'ptm-open': openPartnerModal(el.dataset.id); return true;
    case 'ptm-add-new': openPartnerModal(null); return true;
    case 'ptm-retry': load(); return true;
  }
  return false;
}
