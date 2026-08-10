import { ICON } from './icons.js';
import { esc, fmtVND, fmtDate, fmtDateInputToVN, debounce, todayStr } from './utils.js';
import { openModal, rerenderTopModal, openConfirmModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import {
  listDebtEntities, getDebtGrandTotal, recordPayment, revertPayment, recordAdjustment, revertAdjustment,
} from './api/debt.js';
import { getCustomerHistory, getPartnerHistory } from './api/reports.js';

const DEBT_CONFIRM_THRESHOLD = 2000000;
// Mốc ngày rất xa trong quá khứ, dùng để lấy TOÀN BỘ lịch sử của 1 khách/đối tác (rồi chỉ hiện
// N giao dịch gần nhất trên client) — tái dùng đúng hàm getCustomerHistory/getPartnerHistory đã
// viết cho Báo cáo, không cần thêm truy vấn riêng.
const HISTORY_FROM = '2000-01-01';

let screenWrap = null;
let debtTab = 'customer';
let debtQuery = '';
let selectedDebtId = null;
let debtForm = null;
let entities = [];
let grandTotal = 0;
let entitiesLoading = true;
let entitiesError = null;
// Lịch sử giao dịch gần đây của bản ghi đang chọn (đơn hàng đã chốt + thanh toán, mới nhất
// trước) — hiện ngay trong Quản lý công nợ để tiện đối chiếu khi đang xử lý công nợ người đó.
let historyRows = null;
let historyLimit = 10;
let historyLoading = false;
let historyError = null;

export async function openDebtScreen(){
  debtTab = 'customer';
  debtQuery = '';
  selectedDebtId = null;
  debtForm = null;
  entities = [];
  grandTotal = 0;
  entitiesLoading = true;
  entitiesError = null;
  screenWrap = openModal(screenHtml(), {});
  await loadEntities();
}

async function loadEntities(){
  entitiesLoading = true;
  refresh();
  const myTab = debtTab, myQuery = debtQuery;
  try{
    const [list, total] = await Promise.all([
      listDebtEntities(myTab, myQuery),
      getDebtGrandTotal(myTab),
    ]);
    if(myTab !== debtTab || myQuery !== debtQuery) return; // đã đổi tab/gõ tiếp, bỏ kết quả cũ
    entities = list;
    grandTotal = total;
    entitiesError = null;
  } catch(err){
    if(myTab !== debtTab || myQuery !== debtQuery) return;
    entitiesError = err;
  }
  entitiesLoading = false;
  refresh();
}

function refresh(){
  if(!screenWrap?.isConnected) return;
  rerenderTopModal(screenHtml());
  wireInputs();
}

// Tải lịch sử (đơn hàng đã chốt + thanh toán, mới nhất trước) cho bản ghi đang chọn — chỉ cần
// tải 1 lần khi chọn bản ghi, bấm đổi 10/20/30 chỉ cắt lại mảng đã có sẵn, không gọi mạng lại.
async function loadEntityHistory(id){
  const isCustomer = debtTab === 'customer';
  const myId = id, myTab = debtTab;
  historyLoading = true; historyError = null; historyRows = null;
  refresh();
  try{
    const data = isCustomer
      ? await getCustomerHistory(id, HISTORY_FROM, todayStr())
      : await getPartnerHistory(id, HISTORY_FROM, todayStr());
    if(myId !== selectedDebtId || myTab !== debtTab) return; // đã chuyển sang bản ghi khác
    historyRows = data.rows;
    historyError = null;
  } catch(err){
    if(myId !== selectedDebtId || myTab !== debtTab) return;
    historyError = err;
  }
  historyLoading = false;
  refresh();
}

function historyRowHtml(row, isCustomer){
  if(row.kind==='order'){
    return `
      <div class="order-line-mini">
        <div class="l"><span class="nm">${fmtDate(row.date)} · Đơn ${isCustomer?'bán':'nhập'} đã chốt</span></div>
        <div class="r">${fmtVND(row.amount)}</div>
      </div>
      <div class="field-note" style="margin:-3px 0 8px; text-align:right;">Công nợ sau dòng này: ${fmtVND(row.balanceAfter)}</div>
    `;
  }
  return `
    <div class="order-line-mini">
      <div class="l"><span class="nm">${fmtDate(row.date)} · Thanh toán</span></div>
      <div class="r" style="color:var(--profit);">−${fmtVND(Math.abs(row.raw?.amount||0))}</div>
    </div>
    <div class="field-note" style="margin:-3px 0 8px; text-align:right;">Công nợ sau dòng này: ${fmtVND(row.balanceAfter)}</div>
  `;
}

function screenHtml(){
  const selected = selectedDebtId ? entities.find(e=>e.id===selectedDebtId) : null;
  const label = debtTab==='customer' ? 'khách hàng' : 'đối tác';
  const errors = (debtForm&&debtForm.errors) || {};
  const isSearching = !!debtQuery.trim();

  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
        <div class="modal-title">Quản lý công nợ</div>
      </div>
      <div style="font-size:12px; color:var(--ink-faint); font-weight:600;">${entitiesLoading?'':entities.length+(isSearching?' kết quả':' đang nợ')}</div>
    </div>
    <div class="modal-body" style="padding-left:0; padding-right:0;">
      <div class="debt-tab-row">
        <div class="debt-tab-btn ${debtTab==='customer'?'active':''}" data-action="set-debt-tab" data-tab="customer">Công nợ Khách hàng</div>
        <div class="debt-tab-btn ${debtTab==='partner'?'active':''}" data-action="set-debt-tab" data-tab="partner">Công nợ Đối tác</div>
      </div>

      <div class="p1-card">
        <div class="search-box">${ICON.search}<input id="debt-search" placeholder="Tìm toàn bộ ${label}…" value="${esc(debtQuery)}" autocomplete="off"></div>
      </div>

      ${entitiesLoading ? `<div style="padding:0 16px;">${loadingSkeleton(3)}</div>`
        : entitiesError ? errorBanner('Không tải được danh sách công nợ — kiểm tra lại kết nối mạng.', { retryAction:'retry-debt-screen' })
        : `
      <div class="debt-total-bar">
        <div class="debt-total-label">Tổng ${debtTab==='customer'?'khách hàng đang nợ':'tiền đang nợ đối tác'}</div>
        <div class="debt-total-value">${fmtVND(grandTotal)}</div>
      </div>

      <div class="debt-list">
        ${entities.length ? entities.map(e=>`
          <div class="debt-row ${selectedDebtId===e.id?'selected':''}" data-action="select-debt-entity" data-id="${e.id}">
            <div>
              <div class="debt-row-name">${esc(e.name)}</div>
              <div class="debt-row-sub">${esc(e.phone||'')}</div>
            </div>
            <div class="debt-row-amount">${fmtVND(e.debt)}</div>
          </div>
        `).join('') : `<div class="field-note" style="padding:16px;">${isSearching ? 'Không tìm thấy '+label+' phù hợp.' : 'Không có '+label+' nào đang nợ.'}</div>`}
      </div>

      ${selected ? `
      <div class="debt-detail-card">
        <div class="debt-detail-name">${esc(selected.name)}</div>
        <div class="debt-detail-sub">Đang nợ ${fmtVND(selected.debt)}</div>

        ${errors.paymentDate ? `<div class="form-warning">${ICON.warn} Đã nhập số tiền thanh toán — vui lòng chọn ngày thanh toán.</div>` : ''}

        <div class="field">
          <div class="field-label">Số tiền nợ</div>
          <input class="input" type="number" id="debt-amount" value="${debtForm.debtAmount}">
          <div class="field-note">Sửa số này để điều chỉnh trực tiếp công nợ (VD: đối chiếu lại sổ sách, hoặc ghi nợ mới).</div>
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Số tiền thanh toán</div>
            <input class="input" type="number" id="debt-payment" value="${debtForm.paymentAmount||''}" placeholder="0">
          </div>
          <div class="field">
            <div class="field-label">Ngày thanh toán</div>
            <input class="input ${errors.paymentDate?'error':''}" type="date" id="debt-date" value="${debtForm.paymentDate||''}">
          </div>
        </div>
      </div>

      <div class="card" style="margin:12px 16px 0;">
        <div class="detail-card-head-row" style="margin-bottom:9px;">
          <div class="field-label" style="margin-bottom:0;">Lịch sử gần đây</div>
          <div style="display:flex; gap:6px;">
            ${[10,20,30].map(n=>`<button type="button" class="btn btn-sm ${historyLimit===n?'btn-primary':'btn-ghost'}" data-action="debt-history-limit" data-limit="${n}">${n}</button>`).join('')}
          </div>
        </div>
        ${historyLoading ? loadingSkeleton(3)
          : historyError ? errorBanner('Không tải được lịch sử — kiểm tra lại kết nối mạng.', { retryAction:'retry-debt-history' })
          : (historyRows && historyRows.length) ? historyRows.slice(0, historyLimit).map(r=>historyRowHtml(r, debtTab==='customer')).join('')
          : `<div class="field-note">Chưa có đơn hàng/thanh toán nào.</div>`}
      </div>
      ` : `<div class="field-note" style="padding:14px 16px 0;">Chạm vào một dòng ở trên để xem và cập nhật chi tiết công nợ.</div>`}
      `}
    </div>
    ${!entitiesLoading && !entitiesError && selected ? `
    <div class="modal-foot">
      <button class="btn btn-sm btn-ghost" data-action="close-modal">Đóng</button>
      <button class="btn btn-sm btn-primary btn-block" data-action="save-debt" data-id="${selected.id}">${ICON.check} Lưu</button>
    </div>` : ''}
  `;
}

const scheduleDebtSearch = debounce(async ()=>{
  selectedDebtId = null;
  debtForm = null;
  historyRows = null; historyLimit = 10; historyError = null;
  await loadEntities();
  const fresh = document.getElementById('debt-search');
  if(fresh){ fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
}, 1000);

function wireInputs(){
  const byId = id=>document.getElementById(id);
  const a = byId('debt-amount'); if(a) a.addEventListener('input', e=>{ debtForm.debtAmount = parseFloat(e.target.value)||0; });
  const p = byId('debt-payment'); if(p) p.addEventListener('input', e=>{ debtForm.paymentAmount = e.target.value; });
  const dt = byId('debt-date'); if(dt) dt.addEventListener('input', e=>{ debtForm.paymentDate = e.target.value; });
  const s = byId('debt-search');
  if(s){
    s.addEventListener('input', e=>{
      debtQuery = e.target.value;
      scheduleDebtSearch();
    });
  }
}

function paintWithInputs(){
  refresh();
}

function setDebtTab(tab){
  debtTab = tab;
  debtQuery = '';
  selectedDebtId = null;
  debtForm = null;
  historyRows = null; historyLimit = 10; historyError = null;
  loadEntities();
}
function selectDebtEntity(id){
  selectedDebtId = id;
  const entity = entities.find(e=>e.id===id);
  debtForm = { debtAmount: entity.debt, paymentAmount:'', paymentDate:'', errors:{} };
  historyLimit = 10;
  paintWithInputs();
  loadEntityHistory(id);
}

function saveDebt(entityId){
  const entity = entities.find(e=>e.id===entityId);
  const label = debtTab==='customer' ? 'khách hàng' : 'đối tác';
  const paymentAmt = parseFloat(debtForm.paymentAmount)||0;

  if(paymentAmt > 0){
    if(!debtForm.paymentDate){
      debtForm.errors = { paymentDate:true };
      paintWithInputs();
      return;
    }
    debtForm.errors = {};
    const dateVN = fmtDateInputToVN(debtForm.paymentDate);
    if(paymentAmt > DEBT_CONFIRM_THRESHOLD){
      openConfirmModal('Xác nhận thanh toán?', `${esc(entity.name)} đã thanh toán số tiền ${fmtVND(paymentAmt)} ngày ${dateVN}, xác nhận?`,
        ()=>commitDebtPayment(entityId, paymentAmt, debtForm.paymentDate));
    } else {
      commitDebtPayment(entityId, paymentAmt, debtForm.paymentDate);
    }
    return;
  }

  const newDebt = Math.max(0, parseFloat(debtForm.debtAmount)||0);
  if(newDebt !== entity.debt){
    const diff = Math.abs(newDebt - (entity.debt||0));
    if(diff > DEBT_CONFIRM_THRESHOLD){
      openConfirmModal('Thay đổi công nợ?', `Bạn có muốn thay đổi công nợ của ${label} "${esc(entity.name)}" thành ${fmtVND(newDebt)} không?`,
        ()=>commitDebtAdjustment(entityId, newDebt));
    } else {
      commitDebtAdjustment(entityId, newDebt);
    }
    return;
  }
  showToast('Không có thay đổi để lưu.', []);
}

async function commitDebtPayment(entityId, amount, isoDate){
  const entity = entities.find(e=>e.id===entityId);
  const before = entity.debt||0;
  try{
    const { updated, log } = await recordPayment(debtTab, entityId, amount, isoDate, before);
    entity.debt = updated.debt;
    grandTotal += (updated.debt - before);
    debtForm = { debtAmount: entity.debt, paymentAmount:'', paymentDate:'', errors:{} };
    paintWithInputs();
    if(selectedDebtId===entityId) loadEntityHistory(entityId);
    showToast(`Đã ghi nhận thanh toán ${fmtVND(amount)} cho "${entity.name}".`, [], { icon:ICON.check, undo: async ()=>{
      try{
        await revertPayment(debtTab, entityId, before, log.id);
        grandTotal += (before - entity.debt);
        entity.debt = before;
        if(selectedDebtId===entityId) debtForm = { debtAmount:entity.debt, paymentAmount:'', paymentDate:'', errors:{} };
        paintWithInputs();
        if(selectedDebtId===entityId) loadEntityHistory(entityId);
        showToast('Đã hoàn tác thanh toán.', []);
      } catch(err){
        showToast('Không hoàn tác được — kiểm tra lại kết nối mạng.', []);
      }
    }});
  } catch(err){
    showToast('Không ghi nhận được thanh toán — kiểm tra lại kết nối mạng.', []);
  }
}

async function commitDebtAdjustment(entityId, newDebt){
  const entity = entities.find(e=>e.id===entityId);
  const before = entity.debt||0;
  try{
    const { updated, log } = await recordAdjustment(debtTab, entityId, newDebt, before);
    entity.debt = updated.debt;
    grandTotal += (updated.debt - before);
    debtForm.debtAmount = entity.debt;
    paintWithInputs();
    if(selectedDebtId===entityId) loadEntityHistory(entityId);
    showToast(`Đã cập nhật công nợ của "${entity.name}" thành ${fmtVND(newDebt)}.`, [], { icon:ICON.check, undo: async ()=>{
      try{
        await revertAdjustment(debtTab, entityId, before, log.id);
        grandTotal += (before - entity.debt);
        entity.debt = before;
        if(selectedDebtId===entityId) debtForm.debtAmount = entity.debt;
        paintWithInputs();
        if(selectedDebtId===entityId) loadEntityHistory(entityId);
        showToast('Đã hoàn tác điều chỉnh công nợ.', []);
      } catch(err){
        showToast('Không hoàn tác được — kiểm tra lại kết nối mạng.', []);
      }
    }});
  } catch(err){
    showToast('Không cập nhật được công nợ — kiểm tra lại kết nối mạng.', []);
  }
}

export function handleDebtScreenAction(action, el){
  switch(action){
    case 'set-debt-tab': setDebtTab(el.dataset.tab); return true;
    case 'select-debt-entity': selectDebtEntity(el.dataset.id); return true;
    case 'save-debt': saveDebt(el.dataset.id); return true;
    case 'retry-debt-screen': loadEntities(); return true;
    case 'debt-history-limit': historyLimit = parseInt(el.dataset.limit)||10; paintWithInputs(); return true;
    case 'retry-debt-history': if(selectedDebtId) loadEntityHistory(selectedDebtId); return true;
  }
  return false;
}
