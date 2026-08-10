import { ICON } from './icons.js';
import { esc, fmtVND, fmtDate } from './utils.js';
import { openModal, rerenderTopModal, requestCloseTopModal, openConfirmModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import { getSalesOrder, editClosedSalesOrder } from './api/salesOrders.js';
import { getPurchaseOrder, editClosedPurchaseOrder } from './api/purchaseOrders.js';
import { searchProductsByName } from './api/products.js';

// Popup sửa lại 1 đơn bán/đơn nhập ĐÃ CHỐT — thêm/bớt/đổi dòng sản phẩm, chỉ cho thêm sản
// phẩm có sẵn trong kho (không tạo sản phẩm mới ở đây). Lưu qua RPC edit_closed_sales_order /
// edit_closed_purchase_order để tự tính lại đúng tồn kho + công nợ trong 1 giao dịch — xem
// them-ham-sua-don-da-chot.sql. Luôn hỏi xác nhận trước khi lưu vì đây là đơn đã chốt.

let wrap = null;
let kind = null;        // 'sales' | 'purchase'
let orderId = null;
let order = null;       // bản ghi gốc (để hiện tên khách/đối tác, ngày)
let lines = [];          // {lineId|null, productId, productName, qty, price}
let localLineSeq = 0;
let loadError = null;
let saving = false;
let quickAddQuery = '';
let quickAddProducts = [];
let onSaved = null;      // callback báo nơi gọi (vd màn Công nợ) tải lại sau khi lưu thành công

export async function openEditOrderModal(orderKind, id, onSavedCb){
  kind = orderKind; orderId = id; onSaved = onSavedCb || null;
  order = null; lines = []; loadError = null; saving = false; quickAddQuery = '';
  wrap = openModal(loadingHtml());
  try{
    const [o, products] = await Promise.all([
      kind==='sales' ? getSalesOrder(id) : getPurchaseOrder(id),
      searchProductsByName('', 1000),
    ]);
    order = o;
    quickAddProducts = products;
    const rawLines = kind==='sales' ? (o.sales_order_lines||[]) : (o.purchase_order_lines||[]);
    lines = rawLines.map(l=>({
      lineId: l.id,
      productId: l.product_id,
      productName: l.products?.name || '(sản phẩm đã xoá)',
      qty: l.qty,
      price: kind==='sales' ? l.sell_price : l.import_price,
    }));
  } catch(err){
    loadError = err;
  }
  paint();
}

function loadingHtml(){
  return `
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Sửa đơn đã chốt</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body"><div class="card">${loadingSkeleton(4)}</div></div>
  `;
}

function paint(){
  if(!wrap?.isConnected) return;
  rerenderTopModal(bodyHtml());
  wireInputs();
}

function currentTotal(){
  return lines.reduce((s,l)=> s + l.qty*l.price, 0);
}

function bodyHtml(){
  const title = kind==='sales' ? 'Sửa đơn bán đã chốt' : 'Sửa đơn nhập đã chốt';
  if(loadError){
    return `
      <div class="modal-handle"></div>
      <div class="modal-head"><div class="modal-title">${title}</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
      <div class="modal-body">${errorBanner('Không tải được đơn hàng — kiểm tra lại kết nối mạng.', { retryAction:'eo-retry' })}</div>
    `;
  }
  if(!order) return loadingHtml();

  const partyName = kind==='sales' ? (order.customers?.name||'') : (order.partners?.name||'');
  const total = currentTotal();

  return `
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">${title}</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body">
      <div class="form-warning" style="background:var(--doitac-bg); border-color:#EFDDC0; color:#8A5A1C;">
        ${ICON.warn} Đơn này đã chốt — sửa xong hệ thống sẽ tự tính lại đúng phần chênh lệch vào tồn kho và công nợ ${kind==='sales'?'khách hàng':'đối tác'}.
      </div>
      <div class="card">
        <div class="field-note" style="margin-bottom:0;">${esc(partyName)} · ${fmtDate(order.order_date)}</div>
      </div>

      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Sản phẩm trong đơn (${lines.length})</div>
        <div id="eo-lines">${renderLines()}</div>
        <div class="order-total-bar">
          <div class="order-total-label">Tổng tiền đơn</div>
          <div class="order-total-value">${fmtVND(total)}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">${ICON.search}<input id="eo-search" placeholder="Tìm sản phẩm có sẵn để thêm…" value="${esc(quickAddQuery)}" autocomplete="off"></div>
      </div>

      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Thêm sản phẩm có sẵn</div>
        <div id="eo-quickadd">${renderQuickAdd()}</div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-action="close-modal" ${saving?'disabled':''}>Đóng</button>
      <button class="btn btn-primary btn-block" data-action="eo-save" ${saving?'disabled':''}>${ICON.check} ${saving?'Đang lưu…':'Lưu thay đổi'}</button>
    </div>
  `;
}

function renderLines(){
  if(!lines.length) return `<div class="field-note">Chưa có sản phẩm nào — thêm ở dưới.</div>`;
  return lines.map((l,idx)=>`
    <div class="line-row">
      <div class="line-top">
        <div class="line-name">${esc(l.productName)}</div>
        <div class="line-remove" data-action="eo-remove-line" data-idx="${idx}">${ICON.trash}</div>
      </div>
      <div class="line-bottom">
        <div class="qty-stepper">
          <div class="qty-btn" data-action="eo-qty" data-idx="${idx}" data-delta="-1">${ICON.minus}</div>
          <input class="qty-input" type="number" min="1" value="${l.qty}" data-field="eo-qty-input" data-idx="${idx}">
          <div class="qty-btn" data-action="eo-qty" data-idx="${idx}" data-delta="1">${ICON.plus}</div>
        </div>
        <div class="price-edit">
          <input class="price-input" type="number" value="${l.price}" data-field="eo-price" data-idx="${idx}">
        </div>
        <div class="line-total">${fmtVND(l.qty*l.price)}</div>
      </div>
    </div>
  `).join('');
}

function renderQuickAdd(){
  const q = (quickAddQuery||'').toLowerCase();
  let products = quickAddProducts;
  if(q) products = products.filter(p=>p.name.toLowerCase().includes(q));
  if(!products.length) return `<div class="field-note">Không tìm thấy sản phẩm phù hợp.</div>`;
  return products.map(p=>{
    const price = kind==='sales' ? p.sell_price_retail : p.import_price;
    return `<div class="quickadd-row" data-action="eo-add-line" data-productid="${p.id}">
      <div class="quickadd-left"><span class="dot dot-kho"></span>
        <div><div class="quickadd-name">${esc(p.name)}</div><div class="quickadd-price">${fmtVND(price)}</div></div>
      </div>
      <div class="quickadd-add">${ICON.plus}</div>
    </div>`;
  }).join('');
}

function wireInputs(){
  if(!wrap?.isConnected) return;
  const searchEl = wrap.querySelector('#eo-search');
  if(searchEl){
    searchEl.addEventListener('input', e=>{
      quickAddQuery = e.target.value;
      const el = wrap.querySelector('#eo-quickadd');
      if(el) el.innerHTML = renderQuickAdd();
    });
  }
  wrap.querySelectorAll('[data-field="eo-qty-input"]').forEach(el=>{
    el.addEventListener('input', e=> setQty(parseInt(el.dataset.idx), e.target.value));
  });
  wrap.querySelectorAll('[data-field="eo-price"]').forEach(el=>{
    el.addEventListener('input', e=> setPrice(parseInt(el.dataset.idx), e.target.value));
  });
}

function findProductCache(productId){ return quickAddProducts.find(p=>p.id===productId); }

function addLine(productId){
  const existingIdx = lines.findIndex(l=>l.productId===productId);
  if(existingIdx!==-1){
    lines[existingIdx].qty += 1;
    paint();
    return;
  }
  const p = findProductCache(productId);
  if(!p) return;
  const price = kind==='sales' ? p.sell_price_retail : p.import_price;
  lines.push({ lineId:null, productId, productName:p.name, qty:1, price: price||0 });
  paint();
}

function removeLine(idx){
  lines.splice(idx, 1);
  paint();
}

function setQty(idx, val){
  const qty = Math.max(1, parseInt(val)||1);
  if(!lines[idx]) return;
  lines[idx].qty = qty;
  // chỉ cập nhật số tiền dòng + tổng, không vẽ lại toàn bộ để tránh mất focus khi đang gõ
  const totalEl = wrap.querySelector(`#eo-lines .line-row:nth-child(${idx+1}) .line-total`);
  if(totalEl) totalEl.textContent = fmtVND(lines[idx].qty*lines[idx].price);
  const grandEl = wrap.querySelector('.order-total-value');
  if(grandEl) grandEl.textContent = fmtVND(currentTotal());
}

function setPrice(idx, val){
  const price = Math.max(0, parseFloat(val)||0);
  if(!lines[idx]) return;
  lines[idx].price = price;
  const totalEl = wrap.querySelector(`#eo-lines .line-row:nth-child(${idx+1}) .line-total`);
  if(totalEl) totalEl.textContent = fmtVND(lines[idx].qty*lines[idx].price);
  const grandEl = wrap.querySelector('.order-total-value');
  if(grandEl) grandEl.textContent = fmtVND(currentTotal());
}

function changeQtyByDelta(idx, delta){
  if(!lines[idx]) return;
  lines[idx].qty = Math.max(1, lines[idx].qty + delta);
  paint();
}

function confirmSave(){
  if(!lines.length){
    showToast('Đơn phải còn ít nhất 1 sản phẩm — không thể xoá hết.', []);
    return;
  }
  const partyName = kind==='sales' ? (order.customers?.name||'') : (order.partners?.name||'');
  openConfirmModal(
    'Cập nhật đơn hàng đã chốt?',
    `Bạn có chắc chắn muốn cập nhật đơn hàng đã chốt của "${esc(partyName)}" không? Hệ thống sẽ tự tính lại đúng phần chênh lệch vào tồn kho và công nợ.`,
    ()=>commitSave()
  );
}

async function commitSave(){
  saving = true;
  paint();
  try{
    const payload = lines.map(l=> kind==='sales'
      ? { lineId:l.lineId, productId:l.productId, qty:l.qty, sellPrice:l.price }
      : { lineId:l.lineId, productId:l.productId, qty:l.qty, importPrice:l.price });
    if(kind==='sales') await editClosedSalesOrder(orderId, payload);
    else await editClosedPurchaseOrder(orderId, payload);
    requestCloseTopModal();
    showToast('Đã cập nhật đơn hàng — tồn kho và công nợ đã được tính lại.', []);
    if(onSaved) onSaved();
  } catch(err){
    saving = false;
    paint();
    showToast('Không lưu được thay đổi — kiểm tra lại kết nối mạng và thử lại.', []);
  }
}

export function handleEditOrderModalAction(action, el){
  switch(action){
    case 'eo-remove-line': removeLine(parseInt(el.dataset.idx)); return true;
    case 'eo-qty': changeQtyByDelta(parseInt(el.dataset.idx), parseInt(el.dataset.delta)); return true;
    case 'eo-add-line': addLine(el.dataset.productid); return true;
    case 'eo-save': confirmSave(); return true;
    case 'eo-retry': openEditOrderModal(kind, orderId, onSaved); return true;
  }
  return false;
}
