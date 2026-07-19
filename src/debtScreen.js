import { ICON } from './icons.js';
import { esc, fmtVND, fmtDateInputToVN } from './utils.js';
import { openModal, rerenderTopModal, openConfirmModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import {
  listDebtEntities, recordPayment, revertPayment, recordAdjustment, revertAdjustment,
} from './api/debt.js';

const DEBT_CONFIRM_THRESHOLD = 2000000;

let screenWrap = null;
let debtTab = 'customer';
let debtQuery = '';
let selectedDebtId = null;
let debtForm = null;
let entities = [];
let entitiesLoading = true;
let entitiesError = null;

export async function openDebtScreen(){
  debtTab = 'customer';
  debtQuery = '';
  selectedDebtId = null;
  debtForm = null;
  entities = [];
  entitiesLoading = true;
  entitiesError = null;
  screenWrap = openModal(screenHtml(), {});
  await loadEntities();
}

function filteredEntities(){
  const q = debtQuery.trim().toLowerCase();
  if(!q) return entities;
  return entities.filter(e=> e.name.toLowerCase().includes(q) || (e.phone||'').includes(q));
}

async function loadEntities(){
  entitiesLoading = true;
  refresh();
  try{
    entities = await listDebtEntities(debtTab);
    entitiesError = null;
  } catch(err){
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

function screenHtml(){
  const total = entities.reduce((s,e)=>s+(e.debt||0), 0);
  const filteredList = filteredEntities();
  const selected = selectedDebtId ? entities.find(e=>e.id===selectedDebtId) : null;
  const label = debtTab==='customer' ? 'khách hàng' : 'đối tác';
  const errors = (debtForm&&debtForm.errors) || {};

  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
        <div class="modal-title">Quản lý công nợ</div>
      </div>
      <div style="font-size:12px; color:var(--ink-faint); font-weight:600;">${entitiesLoading?'':entities.length+' đang nợ'}</div>
    </div>
    <div class="modal-body" style="padding-left:0; padding-right:0;">
      <div class="debt-tab-row">
        <div class="debt-tab-btn ${debtTab==='customer'?'active':''}" data-action="set-debt-tab" data-tab="customer">Công nợ Khách hàng</div>
        <div class="debt-tab-btn ${debtTab==='partner'?'active':''}" data-action="set-debt-tab" data-tab="partner">Công nợ Đối tác</div>
      </div>

      ${entitiesLoading ? `<div style="padding:0 16px;">${loadingSkeleton(3)}</div>`
        : entitiesError ? errorBanner('Không tải được danh sách công nợ — kiểm tra lại kết nối mạng.', { retryAction:'retry-debt-screen' })
        : `
      <div class="search-box" style="margin:0 16px 12px;">${ICON.search}<input id="debt-search" placeholder="Tìm ${label} đang nợ…" value="${esc(debtQuery)}" autocomplete="off"></div>

      <div class="debt-total-bar">
        <div class="debt-total-label">Tổng ${debtTab==='customer'?'khách hàng đang nợ':'tiền đang nợ đối tác'}</div>
        <div class="debt-total-value">${fmtVND(total)}</div>
      </div>

      <div class="debt-list">
        ${filteredList.length ? filteredList.map(e=>`
          <div class="debt-row ${selectedDebtId===e.id?'selected':''}" data-action="select-debt-entity" data-id="${e.id}">
            <div>
              <div class="debt-row-name">${esc(e.name)}</div>
              <div class="debt-row-sub">${esc(e.phone||'')}</div>
            </div>
            <div class="debt-row-amount">${fmtVND(e.debt)}</div>
          </div>
        `).join('') : `<div class="field-note" style="padding:16px;">${entities.length ? 'Không tìm thấy '+label+' phù hợp.' : 'Không có '+label+' nào đang nợ.'}</div>`}
      </div>

      ${selected ? `
      <div class="debt-detail-card">
        <div class="debt-detail-name">${esc(selected.name)}</div>
        <div class="debt-detail-sub">Đang nợ ${fmtVND(selected.debt)}</div>

        ${errors.paymentDate ? `<div class="form-warning">${ICON.warn} Đã nhập số tiền thanh toán — vui lòng chọn ngày thanh toán.</div>` : ''}

        <div class="field">
          <div class="field-label">Số tiền nợ</div>
          <input class="input" type="number" id="debt-amount" value="${debtForm.debtAmount}">
          <div class="field-note">Sửa số này để điều chỉnh trực tiếp công nợ (VD: đối chiếu lại sổ sách).</div>
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
      ` : `<div class="field-note" style="padding:14px 16px 0;">Chạm vào một dòng ở trên để xem và cập nhật chi tiết công nợ.</div>`}
      `}
    </div>
    ${!entitiesLoading && !entitiesError && selected ? `
    <div class="modal-foot">
      <button class="btn btn-ghost" data-action="close-modal">Đóng</button>
      <button class="btn btn-primary btn-block" data-action="save-debt" data-id="${selected.id}">${ICON.check} Lưu</button>
    </div>` : ''}
  `;
}

function wireInputs(){
  const byId = id=>document.getElementById(id);
  const a = byId('debt-amount'); if(a) a.addEventListener('input', e=>{ debtForm.debtAmount = parseFloat(e.target.value)||0; });
  const p = byId('debt-payment'); if(p) p.addEventListener('input', e=>{ debtForm.paymentAmount = e.target.value; });
  const dt = byId('debt-date'); if(dt) dt.addEventListener('input', e=>{ debtForm.paymentDate = e.target.value; });
  const s = byId('debt-search');
  if(s){
    s.addEventListener('input', e=>{
      debtQuery = e.target.value;
      refresh();
      const fresh = document.getElementById('debt-search');
      if(fresh){ fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
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
  loadEntities();
}
function selectDebtEntity(id){
  selectedDebtId = id;
  const entity = entities.find(e=>e.id===id);
  debtForm = { debtAmount: entity.debt, paymentAmount:'', paymentDate:'', errors:{} };
  paintWithInputs();
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
    debtForm = { debtAmount: entity.debt, paymentAmount:'', paymentDate:'', errors:{} };
    paintWithInputs();
    showToast(`Đã ghi nhận thanh toán ${fmtVND(amount)} cho "${entity.name}".`, [], { icon:ICON.check, undo: async ()=>{
      try{
        await revertPayment(debtTab, entityId, before, log.id);
        entity.debt = before;
        if(selectedDebtId===entityId) debtForm = { debtAmount:entity.debt, paymentAmount:'', paymentDate:'', errors:{} };
        paintWithInputs();
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
    debtForm.debtAmount = entity.debt;
    paintWithInputs();
    showToast(`Đã cập nhật công nợ của "${entity.name}" thành ${fmtVND(newDebt)}.`, [], { icon:ICON.check, undo: async ()=>{
      try{
        await revertAdjustment(debtTab, entityId, before, log.id);
        entity.debt = before;
        if(selectedDebtId===entityId) debtForm.debtAmount = entity.debt;
        paintWithInputs();
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
  }
  return false;
}
