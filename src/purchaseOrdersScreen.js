import { ICON } from './icons.js';
import { esc, fmtDate, fmtVND, todayStr } from './utils.js';
import { openModal, rerenderTopModal, openConfirmModal, loadingSkeleton, emptyState, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import {
  listPurchaseOrdersByDate, getPurchaseOrder, cancelPurchaseOrder, closePurchaseOrder, poTotal,
} from './api/purchaseOrders.js';
import { getPartner } from './api/partners.js';
import { recordPayment } from './api/debt.js';

let screenWrap = null;
let selectedDate = todayStr();
let partnerQuery = '';
let dayOrders = null;   // toàn bộ đơn trong ngày đang xem, CHƯA lọc theo tên đối tác
let screenError = null;

export async function openPurchaseScreen(){
  selectedDate = todayStr();
  partnerQuery = '';
  dayOrders = null; screenError = null;
  screenWrap = openModal(screenHtml(true), {});
  wireInputs();
  await loadOrdersForDate();
}

async function loadOrdersForDate(){
  const myDate = selectedDate;
  try{
    dayOrders = await listPurchaseOrdersByDate(myDate);
    if(myDate !== selectedDate) return;
    screenError = null;
  } catch(err){
    if(myDate !== selectedDate) return;
    screenError = err;
  }
  if(screenWrap?.isConnected){ rerenderTopModal(screenHtml(false)); wireInputs(); }
}

export function notifyPurchaseOrdersChanged(){
  if(screenWrap && screenWrap.isConnected && document.body.contains(screenWrap)){
    loadOrdersForDate();
  }
}

function filteredOrders(){
  const q = partnerQuery.trim().toLowerCase();
  if(!q || !dayOrders) return dayOrders||[];
  return dayOrders.filter(o=> (o.partners?.name||'').toLowerCase().includes(q));
}
function dayTotal(){
  if(!dayOrders) return 0;
  return dayOrders.reduce((s,o)=> s + (o.purchase_order_lines||[]).reduce((s2,l)=> s2 + l.qty*l.import_price, 0), 0);
}

function screenHtml(loading){
  const filtered = filteredOrders();
  const count = dayOrders ? filtered.length : 0;
  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
        <div class="modal-title">Hàng nhập</div>
      </div>
      <div style="font-size:12px; color:var(--ink-faint); font-weight:600;">${loading?'':count+' đơn'}</div>
    </div>
    <div class="modal-body" style="padding-left:0; padding-right:0; display:flex; flex-direction:column;">
      <div class="p1-card">
        <div class="p1-row">
          <div class="field">
            <div class="field-label">Ngày</div>
            <input class="input" type="date" id="po-date" value="${selectedDate}">
          </div>
        </div>
        <div class="p1-row">
          <div class="field">
            <div class="field-label">Tìm đối tác trong ngày</div>
            <div class="search-box">${ICON.search}<input id="po-partner-search" placeholder="Gõ tên đối tác…" value="${esc(partnerQuery)}" autocomplete="off"></div>
          </div>
        </div>
        <div class="p1-stats">
          <div class="stat-box">
            <div class="stat-label">Tổng tiền mua từ đối tác</div>
            <div class="stat-value">${loading?'…':fmtVND(dayTotal())}</div>
          </div>
        </div>
      </div>
      <div class="list-wrap" id="po-list">
        ${loading ? loadingSkeleton(3)
          : screenError ? errorBanner('Không tải được danh sách đơn mua — kiểm tra lại kết nối mạng.', { retryAction:'retry-purchase-screen' })
          : filtered.length ? filtered.map(o=>renderPOCard(o)).join('')
          : emptyState('Không có đơn mua nào', partnerQuery.trim() ? 'Không tìm thấy đối tác phù hợp trong ngày này.' : 'Tạo đơn bằng cách chạm vào một đối tác ở màn hình chính.')}
      </div>
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
        <button class="btn btn-primary btn-sm" data-action="pay-po-list" data-id="${o.id}" data-partnerid="${o.partner_id}" data-name="${esc(partnerName)}" data-total="${total}">${ICON.check} Thanh toán</button>
        <button class="btn btn-kho btn-sm" data-action="close-po-list" data-id="${o.id}">${ICON.check} Chốt</button>
      </div>` : ''}
    </div>
  </div>`;
}

function wireInputs(){
  if(!screenWrap?.isConnected) return;
  const dateEl = screenWrap.querySelector('#po-date');
  if(dateEl) dateEl.addEventListener('change', e=>{
    selectedDate = e.target.value || todayStr();
    dayOrders = null;
    rerenderTopModal(screenHtml(true));
    wireInputs();
    loadOrdersForDate();
  });
  const searchEl = screenWrap.querySelector('#po-partner-search');
  if(searchEl) searchEl.addEventListener('input', e=>{
    partnerQuery = e.target.value;
    const listEl = screenWrap.querySelector('#po-list');
    if(listEl){
      const filtered = filteredOrders();
      listEl.innerHTML = filtered.length ? filtered.map(o=>renderPOCard(o)).join('')
        : emptyState('Không có đơn mua nào', partnerQuery.trim() ? 'Không tìm thấy đối tác phù hợp trong ngày này.' : 'Tạo đơn bằng cách chạm vào một đối tác ở màn hình chính.');
    }
    const headCount = screenWrap.querySelector('.modal-head > div:last-child');
    if(headCount) headCount.textContent = filteredOrders().length+' đơn';
  });
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
    await loadOrdersForDate();
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
      await loadOrdersForDate();
    } catch(err){
      showToast('Không hủy được đơn hàng — kiểm tra lại kết nối mạng.', []);
    }
  });
}

// Chốt đơn + ghi nhận luôn thanh toán đúng bằng giá trị đơn cho đối tác đó (trả tiền ngay khi
// nhập hàng) — dùng lại đúng RPC close_purchase_order (cộng nợ) rồi recordPayment (trừ lại nợ
// vừa cộng), nên công nợ đối tác không đổi ròng nhưng lịch sử vẫn ghi đủ cả 2 giao dịch.
function confirmPayPOFromList(id, partnerId, name, total){
  openConfirmModal('Xác nhận thanh toán?', `Bạn có đồng ý thực hiện thanh toán ${fmtVND(total)} và chốt đơn mua từ "${esc(name||'đối tác này')}" không?`, ()=>commitPayPOFromList(id, partnerId, total));
}
async function commitPayPOFromList(id, partnerId, total){
  try{
    const diffs = await closePurchaseOrder(id);
    const fresh = await getPartner(partnerId);
    await recordPayment('partner', partnerId, total, todayStr(), fresh.debt||0);
    await loadOrdersForDate();
    if(diffs && diffs.length){
      const warnings = diffs.map(d=>{
        if(d.diff_type==='bu_thieu'){
          const thieu = d.suggested - d.purchased;
          return `${d.product_name}: mua ${d.purchased}/${d.suggested} cần — thiếu ${thieu}, đã lấy bù từ "Trong kho".`;
        }
        const du = d.purchased - d.suggested;
        return `${d.product_name}: mua ${d.purchased}/${d.suggested} cần — dư ${du}, đã nhập vào "Trong kho".`;
      });
      showToast('Đã chốt đơn và ghi nhận thanh toán — có chênh lệch so với gợi ý:', warnings);
    } else {
      showToast('Đã chốt đơn và ghi nhận thanh toán.', []);
    }
  } catch(err){
    showToast('Không thực hiện được — kiểm tra lại kết nối mạng.', []);
  }
}

export function handlePurchaseScreenAction(action, el){
  switch(action){
    case 'view-po-detail': viewPODetail(el.dataset.id); return true;
    case 'close-po-list': closePOFromList(el.dataset.id); return true;
    case 'cancel-po-list': confirmCancelPOFromList(el.dataset.id, el.dataset.name); return true;
    case 'pay-po-list': confirmPayPOFromList(el.dataset.id, el.dataset.partnerid, el.dataset.name, parseFloat(el.dataset.total)||0); return true;
    case 'retry-purchase-screen': loadOrdersForDate(); return true;
  }
  return false;
}
