import { ICON } from './icons.js';
import { esc, fmtDate, fmtVND, todayStr, debounce } from './utils.js';
import { openModal, rerenderTopModal, loadingSkeleton, errorBanner } from './modal.js';
import {
  getRevenueProfitByRange, getTopSellingProducts, getDebtAndStockOverview,
  getCustomerHistory, getPartnerHistory,
} from './api/reports.js';
import { searchCustomersByName } from './api/customers.js';
import { searchPartnersFull } from './api/partners.js';

let screenWrap = null;
let reportType = 'revenue'; // 'revenue' | 'customer-history' | 'partner-history'

// ---- Báo cáo Doanh thu tổng hợp ----
let fromDate = '';
let toDate = '';
let reportData = null;   // { rows, topProducts, overview }
let screenError = null;

// ---- Lịch sử mua bán Khách hàng / Đối tác (state dùng chung, phân biệt qua reportType) ----
let historyEntityId = null;
let historyEntityName = '';
let historyFromDate = '';
let historyToDate = '';
let historyData = null;
let historyError = null;
let historyLoading = false;

// ---- Tìm khách hàng/đối tác (hiện ngay trong khối, không mở popup riêng) ----
let pickerQuery = '';
let pickerItems = null;
let pickerError = null;

function firstDayOfThisMonth(){
  return todayStr().slice(0,7) + '-01';
}

export async function openReportsScreen(){
  reportType = 'revenue';
  fromDate = firstDayOfThisMonth();
  toDate = todayStr();
  reportData = null; screenError = null;
  resetHistoryState();
  screenWrap = openModal(screenHtml(true), {});
  wireInputs();
  await loadReport();
}

function resetHistoryState(){
  historyEntityId = null; historyEntityName = '';
  historyFromDate = firstDayOfThisMonth(); historyToDate = todayStr();
  historyData = null; historyError = null; historyLoading = false;
  pickerQuery = ''; pickerItems = null; pickerError = null;
}

async function loadReport(){
  const myFrom = fromDate, myTo = toDate;
  try{
    const [rows, topProducts, overview] = await Promise.all([
      getRevenueProfitByRange(fromDate, toDate),
      getTopSellingProducts(fromDate, toDate, 10),
      getDebtAndStockOverview(),
    ]);
    if(myFrom !== fromDate || myTo !== toDate) return;
    reportData = { rows, topProducts, overview };
    screenError = null;
  } catch(err){
    if(myFrom !== fromDate || myTo !== toDate) return;
    screenError = err;
  }
  if(screenWrap?.isConnected){ rerenderTopModal(screenHtml(false)); wireInputs(); }
}

function rangeTotals(rows){
  return (rows||[]).reduce((acc, r)=>({ revenue: acc.revenue+r.revenue, profit: acc.profit+r.profit }), { revenue:0, profit:0 });
}

function screenHtml(loading){
  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
      <div class="modal-title">Báo cáo</div>
      <div style="width:32px;"></div>
    </div>
    <div class="modal-body" style="padding-left:0; padding-right:0;">
      <div style="padding:0 16px;">
        <div class="card" style="margin-bottom:12px;">
          <div class="field" style="margin-bottom:0;">
            <div class="field-label">Loại báo cáo</div>
            <select class="input" id="rp-type">
              <option value="revenue" ${reportType==='revenue'?'selected':''}>Doanh thu tổng hợp</option>
              <option value="customer-history" ${reportType==='customer-history'?'selected':''}>Lịch sử mua bán — Khách hàng</option>
              <option value="partner-history" ${reportType==='partner-history'?'selected':''}>Lịch sử mua bán — Đối tác</option>
            </select>
          </div>
        </div>
      </div>
      ${reportType==='revenue' ? revenueScreenHtml(loading) : historyScreenHtml(loading)}
    </div>
  `;
}

// ================== Doanh thu tổng hợp ==================
function revenueScreenHtml(loading){
  return `
    <div style="padding:0 16px;">
      <div class="card" style="margin-bottom:12px;">
        <div class="field-row">
          <div class="field">
            <div class="field-label">Từ ngày</div>
            <input class="input" type="date" id="rp-from" value="${fromDate}">
          </div>
          <div class="field">
            <div class="field-label">Đến ngày</div>
            <input class="input" type="date" id="rp-to" value="${toDate}">
          </div>
        </div>
      </div>
    </div>
    <div id="rp-content" style="padding:0 16px;">
      ${loading ? loadingSkeleton(6)
        : screenError ? errorBanner('Không tải được báo cáo — kiểm tra lại kết nối mạng.', { retryAction:'retry-reports-screen' })
        : reportContentHtml()}
    </div>
  `;
}

function reportContentHtml(){
  const { rows, topProducts, overview } = reportData;
  const totals = rangeTotals(rows);

  return `
    <div class="field-label" style="margin-bottom:9px;">Doanh thu / Lãi-lỗ (${fmtDate(fromDate)} — ${fmtDate(toDate)})</div>
    <div class="card" style="margin-bottom:12px;">
      <div class="p1-stats" style="margin-bottom:${rows.length?'12px':'0'};">
        <div class="stat-box">
          <div class="stat-label">Tổng doanh thu</div>
          <div class="stat-value">${fmtVND(totals.revenue)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Lãi / Lỗ</div>
          <div class="stat-value ${totals.profit>=0?'pos':'neg'}">${totals.profit>=0?'+':'−'}${fmtVND(Math.abs(totals.profit))}</div>
        </div>
      </div>
      ${rows.length ? rows.map(r=>`
        <div class="order-line-mini">
          <div class="l"><span class="nm">${fmtDate(r.date)}</span></div>
          <div class="r">${fmtVND(r.revenue)} · <span style="color:${r.profit>=0?'var(--profit)':'var(--loss)'};">${r.profit>=0?'+':'−'}${fmtVND(Math.abs(r.profit))}</span></div>
        </div>
      `).join('') : `<div class="field-note">Không có đơn bán đã chốt trong khoảng ngày này.</div>`}
    </div>

    <div class="field-label" style="margin-bottom:9px;">Top sản phẩm bán chạy</div>
    <div class="card" style="margin-bottom:12px;">
      ${topProducts.length ? topProducts.map((p,i)=>`
        <div class="order-line-mini">
          <div class="l"><span class="nm">${i+1}. ${esc(p.name)} ×${p.qty}</span></div>
          <div class="r">${fmtVND(p.revenue)}</div>
        </div>
      `).join('') : `<div class="field-note">Không có dữ liệu bán hàng trong khoảng ngày này.</div>`}
    </div>

    <div class="field-label" style="margin-bottom:9px;">Tổng quan công nợ & tồn kho</div>
    <div class="card">
      <div class="p1-stats" style="margin-bottom:10px;">
        <div class="stat-box">
          <div class="stat-label">Nợ khách hàng</div>
          <div class="stat-value">${fmtVND(overview.customerDebtTotal)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Nợ đối tác</div>
          <div class="stat-value">${fmtVND(overview.partnerDebtTotal)}</div>
        </div>
      </div>
      <div class="p1-stats">
        <div class="stat-box">
          <div class="stat-label">Giá trị tồn kho</div>
          <div class="stat-value">${fmtVND(overview.stockValue)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Sản phẩm âm</div>
          <div class="stat-value ${overview.negativeCount?'neg':''}">${overview.negativeCount}</div>
        </div>
      </div>
    </div>
  `;
}

// ================== Lịch sử mua bán Khách hàng / Đối tác ==================
function historyScreenHtml(loading){
  const isCustomer = reportType==='customer-history';
  return `
    <div style="padding:0 16px;">
      <div class="card" style="margin-bottom:12px;">
        <div class="field-row" style="${historyEntityId?'':'margin-bottom:0;'}">
          <div class="field" style="${historyEntityId?'':'margin-bottom:0;'}">
            <div class="field-label">Từ ngày</div>
            <input class="input" type="date" id="rp-h-from" value="${historyFromDate}">
          </div>
          <div class="field" style="${historyEntityId?'':'margin-bottom:0;'}">
            <div class="field-label">Đến ngày</div>
            <input class="input" type="date" id="rp-h-to" value="${historyToDate}">
          </div>
        </div>
        ${historyEntityId ? `
        <div class="field" style="margin-bottom:0;">
          <div class="field-label">Công nợ hiện tại</div>
          <div class="readonly-field" style="font-weight:800; font-family:'Sora';">${historyData ? fmtVND(historyData.currentDebt) : (historyLoading?'…':'')}</div>
        </div>` : ''}
      </div>

      ${historyEntityId ? `
      <div class="entity-header" style="margin:0 0 12px;">
        <div class="eh-info">
          <div class="eh-name">${esc(historyEntityName)}</div>
          <div class="eh-sub">${isCustomer?'Khách hàng':'Đối tác'}</div>
        </div>
        <div class="eh-actions"><button type="button" data-action="rp-change-entity">Đổi</button></div>
      </div>
      ` : `
      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">
          ${ICON.search}
          <input id="rp-picker-search" placeholder="${isCustomer?'Tìm khách hàng…':'Tìm đối tác…'}" value="${esc(pickerQuery)}" autocomplete="off">
        </div>
      </div>
      <div id="rp-picker-list">${pickerListHtml()}</div>
      `}
    </div>
    ${historyEntityId ? `
    <div id="rp-h-content" style="padding:0 16px;">
      ${historyLoading ? loadingSkeleton(6)
        : historyError ? errorBanner('Không tải được lịch sử — kiểm tra lại kết nối mạng.', { retryAction:'retry-history' })
        : historyContentHtml()}
    </div>
    ` : ''}
  `;
}

function historyRowHtml(row){
  const isCustomer = reportType==='customer-history';
  if(row.kind==='order'){
    return `
      <div class="order-line-mini">
        <div class="l"><span class="nm">${fmtDate(row.date)} · Đơn ${isCustomer?'bán':'nhập'} đã chốt</span></div>
        <div class="r">${fmtVND(row.amount)}</div>
      </div>
      <div class="field-note" style="margin:-3px 0 8px; text-align:right;">Công nợ sau dòng này: ${fmtVND(row.balanceAfter)}</div>
    `;
  }
  const log = row.raw;
  const label = log.log_type==='payment' ? 'Thanh toán' : log.log_type==='adjustment' ? 'Điều chỉnh công nợ' : 'Phát sinh công nợ';
  const isReduce = log.log_type==='payment' || (log.log_type==='adjustment' && (log.amount||0)<0);
  return `
    <div class="order-line-mini">
      <div class="l"><span class="nm">${fmtDate(row.date)} · ${label}</span></div>
      <div class="r" style="color:${isReduce?'var(--profit)':'var(--loss)'};">${isReduce?'−':'+'}${fmtVND(Math.abs(log.amount||0))}</div>
    </div>
    <div class="field-note" style="margin:-3px 0 8px; text-align:right;">Công nợ sau dòng này: ${fmtVND(row.balanceAfter)}</div>
  `;
}

function historyContentHtml(){
  if(!historyData) return loadingSkeleton(6);
  const rows = historyData.rows;
  return `
    <div class="field-label" style="margin-bottom:9px;">Lịch sử (${fmtDate(historyFromDate)} — ${fmtDate(historyToDate)})</div>
    <div class="card">
      ${rows.length ? rows.map(historyRowHtml).join('') : `<div class="field-note">Không có đơn hàng/thanh toán nào trong khoảng ngày này.</div>`}
    </div>
  `;
}

function pickerListHtml(){
  if(pickerItems===null) return loadingSkeleton(4);
  if(pickerError) return errorBanner('Không tải được danh sách — kiểm tra lại kết nối mạng.', { retryAction:'rp-picker-retry' });
  if(!pickerItems.length) return `<div class="no-results">Không tìm thấy kết quả phù hợp.</div>`;
  const isCustomer = reportType==='customer-history';
  return pickerItems.map(item=>`
    <div class="result-row" data-action="rp-picker-select" data-id="${item.id}" data-name="${esc(item.name)}">
      <div class="result-icon" style="background:${isCustomer?'#EAF0FB':'var(--doitac-bg)'}; color:${isCustomer?'#2C5289':'var(--doitac)'};">${isCustomer?ICON.user:ICON.truck}</div>
      <div class="result-main">
        <div class="result-title">${esc(item.name)}</div>
        <div class="result-sub">${esc(isCustomer ? (item.phone||'Chưa có SĐT') : (item.address||'Chưa có địa chỉ'))}</div>
      </div>
      <div class="result-meta">${item.debt?fmtVND(item.debt):''}</div>
    </div>
  `).join('');
}

async function loadPickerItems(){
  const isCustomer = reportType==='customer-history';
  const myQuery = pickerQuery;
  try{
    pickerItems = isCustomer ? await searchCustomersByName(pickerQuery) : await searchPartnersFull(pickerQuery);
    if(myQuery !== pickerQuery) return;
    pickerError = null;
  } catch(err){
    if(myQuery !== pickerQuery) return;
    pickerError = err;
  }
  if(screenWrap?.isConnected){ rerenderTopModal(screenHtml(false)); wireInputs(); }
}

const schedulePickerSearch = debounce(()=>{
  if(screenWrap?.isConnected){
    const el = screenWrap.querySelector('#rp-picker-list');
    if(el) el.innerHTML = loadingSkeleton(2);
  }
  loadPickerItems();
}, 1000);

function selectHistoryEntity(id, name){
  historyEntityId = id; historyEntityName = name;
  historyData = null; historyError = null; historyLoading = true;
  rerenderTopModal(screenHtml(false)); wireInputs();
  loadHistory();
}

async function loadHistory(){
  const isCustomer = reportType==='customer-history';
  const myId = historyEntityId, myFrom = historyFromDate, myTo = historyToDate;
  historyLoading = true;
  try{
    historyData = isCustomer
      ? await getCustomerHistory(historyEntityId, historyFromDate, historyToDate)
      : await getPartnerHistory(historyEntityId, historyFromDate, historyToDate);
    if(myId!==historyEntityId || myFrom!==historyFromDate || myTo!==historyToDate) return;
    historyError = null;
  } catch(err){
    if(myId!==historyEntityId || myFrom!==historyFromDate || myTo!==historyToDate) return;
    historyError = err;
  }
  historyLoading = false;
  if(screenWrap?.isConnected){ rerenderTopModal(screenHtml(false)); wireInputs(); }
}

function wireInputs(){
  if(!screenWrap?.isConnected) return;
  const typeEl = screenWrap.querySelector('#rp-type');
  if(typeEl) typeEl.addEventListener('change', e=>{
    reportType = e.target.value;
    if(reportType==='revenue'){
      reportData = null;
      rerenderTopModal(screenHtml(true));
      wireInputs();
      loadReport();
    } else {
      resetHistoryState();
      rerenderTopModal(screenHtml(false));
      wireInputs();
      loadPickerItems();
    }
  });

  // ---- Doanh thu tổng hợp ----
  const fromEl = screenWrap.querySelector('#rp-from');
  if(fromEl) fromEl.addEventListener('change', e=>{
    fromDate = e.target.value || firstDayOfThisMonth();
    reportData = null;
    rerenderTopModal(screenHtml(true));
    wireInputs();
    loadReport();
  });
  const toEl = screenWrap.querySelector('#rp-to');
  if(toEl) toEl.addEventListener('change', e=>{
    toDate = e.target.value || todayStr();
    reportData = null;
    rerenderTopModal(screenHtml(true));
    wireInputs();
    loadReport();
  });

  // ---- Tìm khách hàng/đối tác ----
  const pickerEl = screenWrap.querySelector('#rp-picker-search');
  if(pickerEl){
    pickerEl.addEventListener('input', e=>{
      pickerQuery = e.target.value;
      schedulePickerSearch();
    });
    pickerEl.focus();
    pickerEl.setSelectionRange(pickerEl.value.length, pickerEl.value.length);
  }

  // ---- Lịch sử: khoảng ngày (chỉ tải lại nếu đã chọn khách hàng/đối tác) ----
  const hFromEl = screenWrap.querySelector('#rp-h-from');
  if(hFromEl) hFromEl.addEventListener('change', e=>{
    historyFromDate = e.target.value || firstDayOfThisMonth();
    if(historyEntityId) loadHistory();
  });
  const hToEl = screenWrap.querySelector('#rp-h-to');
  if(hToEl) hToEl.addEventListener('change', e=>{
    historyToDate = e.target.value || todayStr();
    if(historyEntityId) loadHistory();
  });
}

export function handleReportsScreenAction(action, el){
  switch(action){
    case 'retry-reports-screen': loadReport(); return true;
    case 'rp-picker-select': selectHistoryEntity(el.dataset.id, el.dataset.name); return true;
    case 'rp-picker-retry': loadPickerItems(); return true;
    case 'rp-change-entity':
      historyEntityId = null; historyEntityName = ''; historyData = null;
      pickerQuery = ''; pickerItems = null; pickerError = null;
      rerenderTopModal(screenHtml(false)); wireInputs();
      loadPickerItems();
      return true;
    case 'retry-history': loadHistory(); return true;
  }
  return false;
}
