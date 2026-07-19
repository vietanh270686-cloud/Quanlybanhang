import { ICON } from './icons.js';
import { esc, fmtVND } from './utils.js';
import { openModal, rerenderTopModal, loadingSkeleton, errorBanner } from './modal.js';
import { searchCustomersByName } from './api/customers.js';
import { openCustomerModal } from './customers.js';

let wrap = null;
let query = '';
let items = null;
let itemsError = null;

export async function openCustomerMenu(){
  query = ''; items = null; itemsError = null;
  wrap = openModal(menuHtml());
  wireSearch();
  await load();
}

async function load(){
  const myQuery = query;
  try{
    items = await searchCustomersByName(query);
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
    <div class="modal-head"><div class="modal-title">Khách hàng</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body">
      <div class="search-box" style="margin-bottom:10px;">${ICON.search}<input id="cm-search" placeholder="Gõ tên khách hàng để tìm…" value="${esc(query)}" autocomplete="off"></div>
      <div class="add-new-row" data-action="cm-add-new">${ICON.plus} Thêm khách hàng mới</div>
      <div id="cm-list">${listHtml()}</div>
    </div>
  `;
}
function listHtml(){
  if(items===null) return loadingSkeleton(4);
  if(itemsError) return errorBanner('Không tải được danh sách khách hàng — kiểm tra lại kết nối mạng.', { retryAction:'cm-retry' });
  if(!items.length) return `<div class="no-results">Không tìm thấy khách hàng phù hợp.</div>`;
  return items.map(c=>`<div class="result-row" data-action="cm-open" data-id="${c.id}">
    <div class="result-icon" style="background:#EAF0FB; color:#2C5289;">${ICON.user}</div>
    <div class="result-main">
      <div class="result-title">${esc(c.name)}</div>
      <div class="result-sub">${esc(c.phone||'Chưa có SĐT')} · ${c.customer_type==='si'?'Khách sỉ':'Khách lẻ'}</div>
    </div>
    <div class="result-meta">${c.debt?fmtVND(c.debt):''}</div>
  </div>`).join('');
}
function wireSearch(){
  const input = wrap.querySelector('#cm-search');
  if(!input) return;
  input.addEventListener('input', e=>{
    query = e.target.value;
    wrap.querySelector('#cm-list').innerHTML = loadingSkeleton(2);
    load();
  });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

export function handleCustomerMenuAction(action, el){
  switch(action){
    case 'cm-open': openCustomerModal(el.dataset.id); return true;
    case 'cm-add-new': openCustomerModal(null); return true;
    case 'cm-retry': load(); return true;
  }
  return false;
}
