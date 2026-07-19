import { ICON } from './icons.js';
import { esc, fmtVND, debounce } from './utils.js';
import { openModal, rerenderTopModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import { listWarehouseProducts, getAvgImportPriceMap, getPendingKhoQtyMap, updateProduct } from './api/products.js';

let wrap = null;
let query = '';
let items = null;
let itemsError = null;
let avgMap = {};
let pendingQtyMap = {}; // productId -> số lượng đang giữ chỗ cho đơn bán chưa chốt (nguồn Trong kho)
let edits = {}; // productId -> { price, qty } — chỉnh tạm, chỉ ghi vào Supabase khi bấm "Cập nhật"

export async function openWarehouseScreen(){
  query = ''; items = null; itemsError = null; edits = {};
  wrap = openModal(screenHtml());
  wireSearch();
  await load();
}

function minQtyFor(productId){
  return pendingQtyMap[productId] || 0;
}

async function load(){
  const myQuery = query;
  try{
    const [list, avg, pending] = await Promise.all([ listWarehouseProducts(query), getAvgImportPriceMap(), getPendingKhoQtyMap() ]);
    if(myQuery !== query) return;
    items = list;
    avgMap = avg;
    pendingQtyMap = pending;
    itemsError = null;
  } catch(err){
    if(myQuery !== query) return;
    itemsError = err;
  }
  if(wrap?.isConnected){ rerenderTopModal(screenHtml()); wireSearch(); wireRowInputs(); }
}

function priceFor(p){
  if(edits[p.id]?.price!=null) return edits[p.id].price;
  return avgMap[p.id]!=null ? avgMap[p.id] : (p.import_price||0);
}
function qtyFor(p){
  return edits[p.id]?.qty!=null ? edits[p.id].qty : (p.stock_qty||0);
}
function grandTotal(){
  if(!items) return 0;
  return items.reduce((s,p)=> s + qtyFor(p)*priceFor(p), 0);
}
function hasChanges(){
  return Object.keys(edits).length>0;
}

function screenHtml(){
  return `
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Kho hàng</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body">
      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">${ICON.search}<input id="kho-search" placeholder="Gõ tên sản phẩm để tìm…" value="${esc(query)}" autocomplete="off"></div>
        <div class="field-note">Mặc định chỉ hiện sản phẩm còn tồn kho — gõ tìm kiếm để thấy cả sản phẩm đã hết hàng và cập nhật lại.</div>
      </div>
      <div id="kho-list">${listHtml()}</div>
      <div class="order-total-bar">
        <div class="order-total-label">Tổng tiền hàng tồn kho</div>
        <div class="order-total-value" id="kho-total">${fmtVND(grandTotal())}</div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-action="close-modal">Đóng</button>
      <button class="btn btn-primary btn-block" data-action="kho-update" ${hasChanges()?'':'disabled'}>${ICON.check} Cập nhật</button>
    </div>
  `;
}
function listHtml(){
  if(items===null) return loadingSkeleton(4);
  if(itemsError) return errorBanner('Không tải được danh sách kho hàng — kiểm tra lại kết nối mạng.', { retryAction:'kho-retry' });
  if(!items.length) return `<div class="no-results">Không tìm thấy sản phẩm phù hợp.</div>`;
  return items.map(p=>{
    const minQty = minQtyFor(p.id);
    return `
    <div class="kho-row">
      <div class="kho-row-name">${esc(p.name)}</div>
      <div class="kho-row-grid">
        <div class="kho-field">
          <div class="kho-field-label">Giá nhập (TB)</div>
          <input class="price-input" type="number" data-field="kho-price" data-id="${p.id}" value="${priceFor(p)}">
        </div>
        <div class="kho-field">
          <div class="kho-field-label">Số lượng</div>
          <div class="qty-stepper">
            <div class="qty-btn" data-action="kho-qty" data-id="${p.id}" data-delta="-1">${ICON.minus}</div>
            <input class="qty-input" type="number" min="${minQty}" data-field="kho-qty" data-id="${p.id}" value="${qtyFor(p)}">
            <div class="qty-btn" data-action="kho-qty" data-id="${p.id}" data-delta="1">${ICON.plus}</div>
          </div>
        </div>
        <div class="kho-total">
          <div class="kho-field-label">Thành tiền</div>
          <div class="kho-total-value" data-total-for="${p.id}">${fmtVND(qtyFor(p)*priceFor(p))}</div>
        </div>
      </div>
      ${minQty>0 ? `<div class="field-note" style="margin-top:6px;">Đang giữ ${minQty} cho đơn bán chưa chốt — không thể đặt tồn kho thấp hơn số này.</div>` : ''}
    </div>
  `;
  }).join('');
}
const scheduleSearch = debounce(()=>{
  if(wrap?.isConnected) wrap.querySelector('#kho-list').innerHTML = loadingSkeleton(2);
  load();
}, 1000);
function wireSearch(){
  const input = wrap.querySelector('#kho-search');
  if(!input) return;
  input.addEventListener('input', e=>{
    query = e.target.value;
    scheduleSearch();
  });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
function wireRowInputs(){
  wrap.querySelectorAll('[data-field="kho-price"]').forEach(el=>{
    el.addEventListener('input', e=>{
      const id = el.dataset.id;
      edits[id] = edits[id] || {};
      edits[id].price = Math.max(0, parseFloat(e.target.value)||0);
      updateRowTotal(id);
      refreshSaveButton();
    });
  });
  wrap.querySelectorAll('[data-field="kho-qty"]').forEach(el=>{
    el.addEventListener('input', e=>{
      const id = el.dataset.id;
      const minQty = minQtyFor(id);
      let qty = Math.max(0, parseInt(e.target.value)||0);
      if(qty < minQty){
        qty = minQty;
        e.target.value = qty;
        showToast(`Không thể đặt tồn kho thấp hơn ${minQty} — đang có đơn bán chưa chốt cần số lượng này.`, []);
      }
      edits[id] = edits[id] || {};
      edits[id].qty = qty;
      updateRowTotal(id);
      refreshSaveButton();
    });
  });
}
function updateRowTotal(productId){
  const p = items.find(x=>x.id===productId);
  if(!p) return;
  const el = wrap.querySelector(`[data-total-for="${productId}"]`);
  if(el) el.textContent = fmtVND(qtyFor(p)*priceFor(p));
  const totalEl = wrap.querySelector('#kho-total');
  if(totalEl) totalEl.textContent = fmtVND(grandTotal());
}
function refreshSaveButton(){
  const btn = wrap.querySelector('[data-action="kho-update"]');
  if(btn) btn.disabled = !hasChanges();
}
function khoChangeQty(id, delta){
  const p = items.find(x=>x.id===id);
  if(!p) return;
  const minQty = minQtyFor(id);
  edits[id] = edits[id] || {};
  const current = qtyFor(p);
  const next = Math.max(0, current+delta);
  if(next < minQty){
    showToast(`Không thể đặt tồn kho thấp hơn ${minQty} — đang có đơn bán chưa chốt cần số lượng này.`, []);
    return;
  }
  edits[id].qty = next;
  const input = wrap.querySelector(`[data-field="kho-qty"][data-id="${id}"]`);
  if(input) input.value = edits[id].qty;
  updateRowTotal(id);
  refreshSaveButton();
}
async function commitUpdates(){
  const changedIds = Object.keys(edits);
  if(!changedIds.length) return;
  try{
    await Promise.all(changedIds.map(id=>{
      const patch = {};
      if(edits[id].qty!=null) patch.stock_qty = edits[id].qty;
      if(edits[id].price!=null) patch.import_price = edits[id].price;
      return updateProduct(id, patch);
    }));
    edits = {};
    showToast('Đã cập nhật kho hàng.', []);
    await load();
  } catch(err){
    showToast('Không cập nhật được kho hàng — kiểm tra lại kết nối mạng.', []);
  }
}

export function handleWarehouseAction(action, el){
  switch(action){
    case 'kho-qty': khoChangeQty(el.dataset.id, parseInt(el.dataset.delta)); return true;
    case 'kho-update': commitUpdates(); return true;
    case 'kho-retry': load(); return true;
  }
  return false;
}
