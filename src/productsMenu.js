import { ICON } from './icons.js';
import { esc, fmtVND, debounce, sortNegativeStockFirst } from './utils.js';
import { openModal, rerenderTopModal, loadingSkeleton, errorBanner } from './modal.js';
import { searchProductsByName, getLatestPartnerPricesMap } from './api/products.js';
import { openProductModal } from './products.js';

let wrap = null;
let query = '';
let items = null;
let itemsError = null;
let latestPartnerMap = {};

export async function openProductMenu(){
  query = ''; items = null; itemsError = null;
  wrap = openModal(menuHtml());
  wireSearch();
  await load();
}

async function load(){
  const myQuery = query;
  try{
    const [list, partnerMap] = await Promise.all([ searchProductsByName(query), getLatestPartnerPricesMap() ]);
    if(myQuery !== query) return;
    items = sortNegativeStockFirst(list);
    latestPartnerMap = partnerMap;
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
    <div class="modal-head"><div class="modal-title">Sản phẩm</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body">
      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">${ICON.search}<input id="pm-search" placeholder="Gõ tên sản phẩm để tìm…" value="${esc(query)}" autocomplete="off"></div>
      </div>
      <div class="add-new-row" data-action="pm-add-new">${ICON.plus} Thêm sản phẩm mới</div>
      <div id="pm-list">${listHtml()}</div>
    </div>
  `;
}
function listHtml(){
  if(items===null) return loadingSkeleton(4);
  if(itemsError) return errorBanner('Không tải được danh sách sản phẩm — kiểm tra lại kết nối mạng.', { retryAction:'pm-retry' });
  if(!items.length) return `<div class="no-results">Không tìm thấy sản phẩm phù hợp.</div>`;
  return items.map(p=>{
    const lp = latestPartnerMap[p.id];
    const stock = p.stock_qty||0;
    return `<div class="result-row" data-action="pm-open" data-id="${p.id}">
      <div class="result-icon" style="background:var(--kho-bg); color:var(--kho);">${ICON.box}</div>
      <div class="result-main">
        <div class="result-title">${esc(p.name)} ${stock<0?`<span class="stock-pill low">Âm ${Math.abs(stock)} — cần mua bù</span>`:''}</div>
        <div class="result-sub">Tồn kho: ${stock} · Nhập gần nhất: ${fmtVND(lp?lp.price:p.import_price)}${lp?' · '+esc(lp.partnerName||''):''}</div>
      </div>
      <div class="result-meta">Lẻ ${fmtVND(p.sell_price_retail)}</div>
    </div>`;
  }).join('');
}
const scheduleSearch = debounce(()=>{
  if(wrap?.isConnected) wrap.querySelector('#pm-list').innerHTML = loadingSkeleton(2);
  load();
}, 1000);
function wireSearch(){
  const input = wrap.querySelector('#pm-search');
  if(!input) return;
  input.addEventListener('input', e=>{
    query = e.target.value;
    scheduleSearch();
  });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

export function handleProductMenuAction(action, el){
  switch(action){
    case 'pm-open': openProductModal(el.dataset.id); return true;
    case 'pm-add-new': openProductModal(null); return true;
    case 'pm-retry': load(); return true;
  }
  return false;
}
