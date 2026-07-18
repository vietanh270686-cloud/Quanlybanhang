import { ICON } from './icons.js';
import { esc, fmtDate, fmtVND } from './utils.js';
import { openModal, rerenderTopModal, openConfirmModal, loadingSkeleton, emptyState, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import {
  listTodayPurchaseOrders, getPurchaseOrder, cancelPurchaseOrder, closePurchaseOrder, poTotal,
} from './api/purchaseOrders.js';

let screenWrap = null;
let screenOrders = null;
let screenError = null;

export async function openPurchaseScreen(){
  screenOrders = null; screenError = null;
  screenWrap = openModal(screenHtml(true), {});
  await loadOrders();
}

async function loadOrders(){
  try{
    screenOrders = await listTodayPurchaseOrders();
    screenError = null;
  } catch(err){
    screenError = err;
  }
  if(screenWrap && screenWrap.isConnected){
    rerenderTopModal(screenHtml(false));
  }
}

export function notifyPurchaseOrdersChanged(){
  if(screenWrap && screenWrap.isConnected && document.body.contains(screenWrap)){
    loadOrders();
  }
}

function screenHtml(loading){
  const count = screenOrders ? screenOrders.length : 0;
  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
        <div class="modal-title">Hàng nhập hôm nay</div>
      </div>
      <div style="font-size:12px; color:var(--ink-faint); font-weight:600;">${loading?'':count+' đơn'}</div>
    </div>
    <div class="modal-body" style="padding-left:0; padding-right:0;">
      ${loading ? `<div style="padding:0 18px;">${loadingSkeleton(3)}</div>`
        : screenError ? errorBanner('Không tải được danh sách đơn mua — kiểm tra lại kết nối mạng.', { retryAction:'retry-purchase-screen' })
        : screenOrders.length ? screenOrders.map(o=>renderPOCard(o)).join('')
        : emptyState('Chưa có đơn mua nào hôm nay', 'Tạo đơn bằng cách chạm vào một đối tác ở màn hình chính.')}
    </div>
  `;
}

function renderPOCard(o){
  const partnerName = o.partners?.name || '';
  const lines = o.purchase_order_lines || [];
  const total = lines.reduce((s,l)=> s + l.qty*l.import_price, 0);
  return `
  <div class="order-card">
    <div class="order-card-head" data-action="view-po-detail" data-id="${o.id}">
      <div>
        <div class="order-card-title">${esc(partnerName)}</div>
        <div class="order-card-date">${fmtDate(o.order_date)} · ${lines.length} sản phẩm</div>
      </div>
      <div class="status-chip status-${o.status==='moi'?'moi':o.status==='closed'?'closed':'cancelled'}">${o.status==='moi'?'Mới':o.status==='closed'?'Đã chốt':'Đã hủy'}</div>
    </div>
    ${lines.map(l=>`<div class="order-line-mini">
        <div class="l"><span class="nm">${esc(l.products?.name)} ×${l.qty}</span></div>
        <div class="r">${fmtVND(l.qty*l.import_price)}</div>
      </div>`).join('')}
    <div class="order-card-foot">
      <div class="order-sum"><div class="order-sum-total">${fmtVND(total)}</div></div>
      ${o.status==='moi' ? `
      <div class="order-actions">
        <button class="btn btn-danger-ghost btn-sm" data-action="cancel-po-list" data-id="${o.id}" data-name="${esc(partnerName)}">${ICON.x} Hủy</button>
        <button class="btn btn-kho btn-sm" data-action="close-po-list" data-id="${o.id}">${ICON.check} Chốt</button>
      </div>` : ''}
    </div>
  </div>`;
}

async function viewPODetail(id){
  const wrap = openModal(`
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Chi tiết đơn mua</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body"><div class="card">${loadingSkeleton(3)}</div></div>
  `, {});
  try{
    const o = await getPurchaseOrder(id);
    const total = poTotal(o);
    rerenderTopModal(`
      <div class="modal-handle"></div>
      <div class="modal-head">
        <div class="modal-title">Chi tiết đơn mua — ${esc(o.partners?.name)}</div>
        <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
      </div>
      <div class="modal-body">
        <div class="card">
          <div class="field-note" style="margin-bottom:8px;">${fmtDate(o.order_date)} · Trạng thái: ${o.status==='moi'?'Mới':o.status==='closed'?'Đã chốt':'Đã hủy'}</div>
          ${o.purchase_order_lines.map(l=>`<div class="line-row">
              <div class="line-top"><div class="line-name">${esc(l.products?.name)}</div></div>
              <div class="line-bottom">
                <div style="font-size:12.5px; color:var(--ink-faint);">SL ${l.qty} × ${fmtVND(l.import_price)}</div>
                <div class="line-total">${fmtVND(l.qty*l.import_price)}</div>
              </div>
            </div>`).join('')}
          <div class="order-total-bar">
            <div class="order-total-label">Tổng tiền đơn</div>
            <div class="order-total-value">${fmtVND(total)}</div>
          </div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost btn-block" data-action="close-modal">Đóng</button></div>
    `);
  } catch(err){
    rerenderTopModal(`
      <div class="modal-handle"></div>
      <div class="modal-head"><div class="modal-title">Chi tiết đơn mua</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
      <div class="modal-body">${errorBanner('Không tải được chi tiết đơn — kiểm tra lại kết nối mạng.')}</div>
    `);
  }
}

async function closePOFromList(id){
  try{
    const diffs = await closePurchaseOrder(id);
    await loadOrders();
    if(diffs && diffs.length){
      const warnings = diffs.map(d=>{
        if(d.diff_type==='bu_thieu'){
          const thieu = d.suggested - d.purchased;
          return `${d.product_name}: mua ${d.purchased}/${d.suggested} cần — thiếu ${thieu}, đã lấy bù từ "Trong kho".`;
        }
        const du = d.purchased - d.suggested;
        return `${d.product_name}: mua ${d.purchased}/${d.suggested} cần — dư ${du}, đã nhập vào "Trong kho".`;
      });
      showToast('Đã chốt đơn mua — có chênh lệch so với gợi ý:', warnings);
    } else {
      showToast('Đã chốt đơn mua thành công.', []);
    }
  } catch(err){
    showToast('Không chốt được đơn mua — kiểm tra lại kết nối mạng.', []);
  }
}
function confirmCancelPOFromList(id, name){
  openConfirmModal('Hủy đơn hàng?', `Bạn có chắc muốn hủy đơn mua từ "${esc(name||'đối tác này')}" không? Không thể hoàn tác thao tác này.`, async ()=>{
    try{
      await cancelPurchaseOrder(id);
      await loadOrders();
    } catch(err){
      showToast('Không hủy được đơn hàng — kiểm tra lại kết nối mạng.', []);
    }
  });
}

export function handlePurchaseScreenAction(action, el){
  switch(action){
    case 'view-po-detail': viewPODetail(el.dataset.id); return true;
    case 'close-po-list': closePOFromList(el.dataset.id); return true;
    case 'cancel-po-list': confirmCancelPOFromList(el.dataset.id, el.dataset.name); return true;
    case 'retry-purchase-screen': loadOrders(); return true;
  }
  return false;
}
