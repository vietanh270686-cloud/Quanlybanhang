import { ICON } from './icons.js';
import { esc, fmtDate } from './utils.js';
import { fmtVND } from './utils.js';
import { openModal, rerenderTopModal, openConfirmModal, loadingSkeleton, emptyState, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import {
  listTodaySalesOrders, getSalesOrder, cancelSalesOrder, closeSalesOrder,
  orderTotal, orderLineProfit, orderProfit,
} from './api/salesOrders.js';

let screenWrap = null;
let screenOrders = null;
let screenError = null;

export async function openSalesScreen(){
  screenOrders = null; screenError = null;
  screenWrap = openModal(screenHtml(true), {});
  await loadOrders();
}

async function loadOrders(){
  try{
    screenOrders = await listTodaySalesOrders();
    screenError = null;
  } catch(err){
    screenError = err;
  }
  if(screenWrap && screenWrap.isConnected){
    rerenderTopModal(screenHtml(false));
  }
}

export function notifySalesOrdersChanged(){
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
        <div class="modal-title">Đơn bán hôm nay</div>
      </div>
      <div style="font-size:12px; color:var(--ink-faint); font-weight:600;">${loading?'':count+' đơn'}</div>
    </div>
    <div class="modal-body" style="padding-left:0; padding-right:0;">
      ${loading ? `<div style="padding:0 18px;">${loadingSkeleton(3)}</div>`
        : screenError ? errorBanner('Không tải được danh sách đơn bán — kiểm tra lại kết nối mạng.', { retryAction:'retry-sales-screen' })
        : screenOrders.length ? screenOrders.map(o=>renderSOCard(o)).join('')
        : emptyState('Chưa có đơn bán nào hôm nay', 'Tạo đơn bằng cách chạm vào một khách hàng ở màn hình chính.')}
    </div>
  `;
}

function renderSOCard(o){
  const custName = o.customers?.name || '';
  const lines = o.sales_order_lines || [];
  const total = lines.reduce((s,l)=> s + l.qty*l.sell_price, 0);
  const profit = lines.reduce((s,l)=> s + (l.sell_price - l.import_price_at_sale)*l.qty, 0);
  return `
  <div class="order-card">
    <div class="order-card-head" data-action="view-so-detail" data-id="${o.id}">
      <div>
        <div class="order-card-title">${esc(custName)}</div>
        <div class="order-card-date">${fmtDate(o.order_date)} · ${lines.length} sản phẩm</div>
      </div>
      <div class="status-chip status-${o.status==='moi'?'moi':o.status==='closed'?'closed':'cancelled'}">${o.status==='moi'?'Mới':o.status==='closed'?'Đã chốt':'Đã hủy'}</div>
    </div>
    ${lines.map(l=>`<div class="order-line-mini">
        <div class="l"><span class="dot ${l.source_type==='kho'?'dot-kho':'dot-doitac'}"></span><span class="nm">${esc(l.products?.name)} ×${l.qty}</span></div>
        <div class="r">${fmtVND(l.qty*l.sell_price)}</div>
      </div>`).join('')}
    <div class="order-card-foot">
      <div class="order-sum">
        <div class="order-sum-total">${fmtVND(total)}</div>
        <div class="order-sum-profit ${profit>=0?'pos':'neg'}">${profit>=0?'Lãi':'Lỗ'} ${fmtVND(Math.abs(profit))}</div>
      </div>
      ${o.status==='moi' ? `
      <div class="order-actions">
        <button class="btn btn-danger-ghost btn-sm" data-action="cancel-so-list" data-id="${o.id}" data-name="${esc(custName)}">${ICON.x} Hủy</button>
        <button class="btn btn-kho btn-sm" data-action="close-so-list" data-id="${o.id}">${ICON.check} Chốt</button>
      </div>` : ''}
    </div>
  </div>`;
}

async function viewSODetail(id){
  const wrap = openModal(`
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Chi tiết đơn</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body"><div class="card">${loadingSkeleton(3)}</div></div>
  `, {});
  try{
    const o = await getSalesOrder(id);
    const total = orderTotal(o);
    const profit = orderProfit(o);
    rerenderTopModal(`
      <div class="modal-handle"></div>
      <div class="modal-head">
        <div class="modal-title">Chi tiết đơn — ${esc(o.customers?.name)}</div>
        <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
      </div>
      <div class="modal-body">
        <div class="card">
          <div class="field-note" style="margin-bottom:8px;">${fmtDate(o.order_date)} · Trạng thái: ${o.status==='moi'?'Mới':o.status==='closed'?'Đã chốt':'Đã hủy'}</div>
          ${o.sales_order_lines.map(l=>{
            const lp = orderLineProfit(l);
            return `<div class="line-row">
              <div class="line-top">
                <div>
                  <div class="line-name">${esc(l.products?.name)}</div>
                  <div class="line-src ${l.source_type==='kho'?'kho':'doitac'}"><span class="dot ${l.source_type==='kho'?'dot-kho':'dot-doitac'}"></span>${l.source_type==='kho'?'Trong kho':'Đối tác: '+esc(l.partners?.name||'')}</div>
                </div>
              </div>
              <div class="line-bottom">
                <div style="font-size:12.5px; color:var(--ink-faint);">SL ${l.qty} × ${fmtVND(l.sell_price)}</div>
                <div style="font-size:12.5px; color:var(--ink-faint);">Vốn: ${fmtVND(l.import_price_at_sale)}</div>
                <div class="line-total">${fmtVND(l.qty*l.sell_price)}</div>
              </div>
              <div class="line-refnote" style="color:${lp>=0?'var(--profit)':'var(--loss)'}; font-weight:700;">${lp>=0?'Lãi':'Lỗ'} ${fmtVND(Math.abs(lp))}</div>
            </div>`;
          }).join('')}
          <div class="order-total-bar">
            <div class="order-total-label">Tổng tiền đơn</div>
            <div class="order-total-value">${fmtVND(total)}</div>
          </div>
          <div class="field-note" style="margin-top:8px; font-weight:700; color:${profit>=0?'var(--profit)':'var(--loss)'};">${profit>=0?'Tổng lãi':'Tổng lỗ'}: ${fmtVND(Math.abs(profit))}</div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost btn-block" data-action="close-modal">Đóng</button></div>
    `);
  } catch(err){
    rerenderTopModal(`
      <div class="modal-handle"></div>
      <div class="modal-head"><div class="modal-title">Chi tiết đơn</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
      <div class="modal-body">${errorBanner('Không tải được chi tiết đơn — kiểm tra lại kết nối mạng.')}</div>
    `);
  }
}

async function closeSOFromList(id){
  try{
    await closeSalesOrder(id);
    await loadOrders();
  } catch(err){
    showToast('Không chốt được đơn — kiểm tra lại kết nối mạng.', []);
  }
}
function confirmCancelSOFromList(id, name){
  openConfirmModal('Hủy đơn hàng?', `Bạn có chắc muốn hủy đơn hàng của "${esc(name||'khách này')}" không? Không thể hoàn tác thao tác này.`, async ()=>{
    try{
      await cancelSalesOrder(id);
      await loadOrders();
    } catch(err){
      showToast('Không hủy được đơn hàng — kiểm tra lại kết nối mạng.', []);
    }
  });
}

export function handleSalesScreenAction(action, el){
  switch(action){
    case 'view-so-detail': viewSODetail(el.dataset.id); return true;
    case 'close-so-list': closeSOFromList(el.dataset.id); return true;
    case 'cancel-so-list': confirmCancelSOFromList(el.dataset.id, el.dataset.name); return true;
    case 'retry-sales-screen': loadOrders(); return true;
  }
  return false;
}
