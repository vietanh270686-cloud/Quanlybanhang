import { ICON } from './icons.js';
import { esc, fmtDate, fmtVND, debounce } from './utils.js';
import { openModal, rerenderTopModal, requestCloseTopModal, openConfirmModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import { getHomeCounts } from './api/dashboard.js';
import { searchProductsByName, createProduct } from './api/products.js';
import { searchCustomersByName } from './api/customers.js';
import { searchPartnersFull } from './api/partners.js';
import { findByExactName } from './supabaseClient.js';
import { openProductModal, repaintProductView } from './products.js';
import { openCustomerModal, repaintCustomerView } from './customers.js';
import { openPartnerModal, repaintPartnerView } from './partners.js';

// Màn hình chính mới: 3 tab cố định (Sản phẩm/Khách hàng/Đối tác), mỗi tab ở trạng thái
// "khoá" cho tới khi người dùng chọn/tạo 1 bản ghi cụ thể — thay thế hoàn toàn home.js +
// 3 file productsMenu/customersMenu/partnersMenu cũ. Vùng nội dung (2 khối con) do
// products.js/customers.js/partners.js tự vẽ qua paintEntityView(), mainScreen chỉ lo
// khung sườn (tab-bar, thẻ trạng thái, khoá, thanh 5 icon dưới cùng).
const ENTITY_META = {
  sanpham: { label:'Sản phẩm', icon:ICON.box, open:openProductModal, repaint:repaintProductView, search: q=>searchProductsByName(q) },
  khach:   { label:'Khách hàng', icon:ICON.user, open:openCustomerModal, repaint:repaintCustomerView, search: q=>searchCustomersByName(q) },
  doitac:  { label:'Đối tác', icon:ICON.truck, open:openPartnerModal, repaint:repaintPartnerView, search: q=>searchPartnersFull(q) },
};
const TAB_ORDER = ['sanpham', 'khach', 'doitac'];

let activeTab = 'sanpham';
const touched = { sanpham:false, khach:false, doitac:false };

let homeCounts = null;
let homeCountsError = null;

export async function renderMainScreen(){
  const el = document.getElementById('homeView');
  el.innerHTML = shellHtml();
  applyView(activeTab, null);
  await loadCounts();
}

// products.js/customers.js/partners.js gọi lại hàm này sau khi tạo/sửa/xoá xong 1 bản ghi —
// thay cho resetSearchAndRefresh() của home.js cũ (vốn sẽ vẽ đè mất toàn bộ màn 3-tab mới nếu
// còn gọi renderHome()). Ở đây chỉ cần làm mới số liệu badge ở thanh 5 icon dưới cùng.
export function refreshMainCounts(){
  loadCounts();
}

async function loadCounts(){
  try{
    homeCounts = await getHomeCounts();
    homeCountsError = null;
  } catch(err){
    homeCountsError = err;
  }
  const bn = document.querySelector('.bottomnav');
  if(bn) bn.innerHTML = bottomNavHtml();
}

function shellHtml(){
  return `
    <div class="main-screen">
      <div class="topbar">
        <div class="brand-wrap">
          <div class="brand display">Sổ Bán Hàng</div>
          <div class="brand-sub">Mỹ Phẩm & Đồ Gia Dụng</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="today-pill">${fmtDate(new Date())}</div>
          <div class="icon-btn" data-action="logout" title="Đăng xuất">${ICON.logout}</div>
        </div>
      </div>
      <div class="tabbar" id="mainTabbar">${tabbarHtml()}</div>
      <div id="mainEntityHeader"></div>
      <div id="mainDetailWrap" class="detail-wrap"></div>
      <div id="mainFooter"></div>
      <div class="bottomnav">${bottomNavHtml()}</div>
    </div>
  `;
}

function tabbarHtml(){
  return TAB_ORDER.map(type=>`
    <div class="tab ${activeTab===type?'active':''}" data-action="switch-tab" data-type="${type}">
      ${ENTITY_META[type].icon}<span>${ENTITY_META[type].label}</span>
    </div>
  `).join('');
}

function bottomNavHtml(){
  const c = homeCounts;
  return `
    <div class="bn-item" data-action="open-sales-screen">${c?.soToday?`<div class="bn-badge">${c.soToday}</div>`:''}${ICON.receipt}<span>Đơn bán</span></div>
    <div class="bn-item" data-action="open-purchase-screen">${c?.poToday?`<div class="bn-badge">${c.poToday}</div>`:''}${ICON.cart}<span>Hàng nhập</span></div>
    <div class="bn-item" data-action="open-debt-screen">${c?.debtTotalCount?`<div class="bn-badge">${c.debtTotalCount}</div>`:''}${ICON.debt}<span>QL Công nợ</span></div>
    <div class="bn-item" data-action="open-warehouse">${ICON.warehouse}<span>Kho hàng</span></div>
    <div class="bn-item" data-action="open-reports-screen">${ICON.chart}<span>Báo cáo</span></div>
  `;
}

// ---------- Vẽ nội dung tab đang chọn ----------
// products.js/customers.js/partners.js gọi hàm này mỗi khi vẽ lại — chỉ áp dụng nếu đúng
// tab đang hiện (tránh 1 fetch bất đồng bộ của tab vừa rời khỏi ghi đè nhầm tab mới).
export function paintEntityView(type, view){
  if(type !== activeTab) return;
  applyView(type, view);
}

function applyView(type, view){
  const headerEl = document.getElementById('mainEntityHeader');
  const bodyEl = document.getElementById('mainDetailWrap');
  const footEl = document.getElementById('mainFooter');
  if(!headerEl || !bodyEl || !footEl) return;
  const meta = ENTITY_META[type];

  if(!touched[type]){
    headerEl.innerHTML = lockedHeaderHtml(type, meta);
    bodyEl.innerHTML = lockedCardHtml(type, meta);
    footEl.innerHTML = '';
    return;
  }
  if(!view || view.loading){
    headerEl.innerHTML = lockedHeaderHtml(type, meta, 'Đang tải…');
    bodyEl.innerHTML = `<div class="detail-card"><div class="detail-card-body">${loadingSkeleton(4)}</div></div>`;
    footEl.innerHTML = '';
    return;
  }
  if(view.error){
    headerEl.innerHTML = lockedHeaderHtml(type, meta, 'Không tải được dữ liệu');
    bodyEl.innerHTML = `<div class="detail-card"><div class="detail-card-body">${errorBanner('Không tải được dữ liệu — kiểm tra lại kết nối mạng.', { retryAction: view.retryAction })}</div></div>`;
    footEl.innerHTML = '';
    return;
  }

  headerEl.innerHTML = activeHeaderHtml(type, view);
  bodyEl.innerHTML = view.bodyHtml;
  footEl.innerHTML = view.footerHtml ? `<div class="main-foot">${view.footerHtml}</div>` : '';
  view.wire && view.wire();
}

function lockedHeaderHtml(type, meta, subOverride){
  return `
    <div class="entity-header locked" data-action="open-picker" data-type="${type}">
      <div class="eh-info">
        <div class="eh-name">Chưa chọn ${meta.label.toLowerCase()}</div>
        <div class="eh-sub">${subOverride || `Chạm để tìm hoặc tạo ${meta.label.toLowerCase()} mới`}</div>
      </div>
      <div class="eh-actions"><button type="button" class="primary">${ICON.search} Tìm</button></div>
    </div>
  `;
}
function activeHeaderHtml(type, view){
  return `
    <div class="entity-header">
      <div class="eh-info">
        <div class="eh-name">${esc(view.name||'')}</div>
        <div class="eh-sub">${esc(view.sub||'')}</div>
      </div>
      <div class="eh-actions"><button type="button" data-action="open-picker" data-type="${type}">Đổi</button></div>
    </div>
  `;
}
function lockedCardHtml(type, meta){
  return `
    <div class="detail-card locked-card" data-action="open-picker" data-type="${type}">
      <div class="locked-inner">
        ${meta.icon}
        <div class="locked-title">Chưa chọn ${meta.label.toLowerCase()}</div>
        <div class="locked-sub">Chạm để tìm ${meta.label.toLowerCase()} có sẵn hoặc tạo mới</div>
      </div>
    </div>
  `;
}

function switchTab(type){
  if(type === activeTab || !ENTITY_META[type]) return;
  activeTab = type;
  const tb = document.getElementById('mainTabbar');
  if(tb) tb.innerHTML = tabbarHtml();
  if(touched[type]){
    ENTITY_META[type].repaint();
  } else {
    applyView(type, null);
  }
}

// ---------- Popup tìm / chọn / tạo mới (dùng chung cho cả 3 tab) ----------
let pickerType = null;
let pickerQuery = '';
let pickerItems = null;
let pickerError = null;
let pickerWrap = null;

function openPicker(type){
  if(!ENTITY_META[type]) return;
  pickerType = type; pickerQuery = ''; pickerItems = null; pickerError = null;
  pickerWrap = openModal(pickerHtml());
  wirePicker();
  loadPickerItems();
}

async function loadPickerItems(){
  const meta = ENTITY_META[pickerType];
  const myQuery = pickerQuery;
  try{
    pickerItems = await meta.search(pickerQuery);
    if(myQuery !== pickerQuery) return;
    pickerError = null;
  } catch(err){
    if(myQuery !== pickerQuery) return;
    pickerError = err;
  }
  if(pickerWrap?.isConnected){ rerenderTopModal(pickerHtml()); wirePicker(); }
}

function pickerHtml(){
  const meta = ENTITY_META[pickerType];
  const labelLower = meta.label.toLowerCase();
  return `
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Chọn ${labelLower}</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body">
      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">${ICON.search}<input id="picker-search" placeholder="Gõ tên để tìm…" value="${esc(pickerQuery)}" autocomplete="off"></div>
      </div>
      <div class="add-new-row" data-action="picker-add-new">${ICON.plus} Thêm ${labelLower} mới</div>
      <div id="picker-list">${pickerListHtml()}</div>
    </div>
  `;
}

function pickerListHtml(){
  if(pickerItems===null) return loadingSkeleton(4);
  if(pickerError) return errorBanner('Không tải được danh sách — kiểm tra lại kết nối mạng.', { retryAction:'picker-retry' });
  if(!pickerItems.length) return `<div class="no-results">Không tìm thấy kết quả phù hợp.</div>`;
  return pickerItems.map(item=>pickerRowHtml(pickerType, item)).join('');
}

function pickerRowHtml(type, item){
  if(type==='sanpham'){
    const stock = item.stock_qty||0;
    return `<div class="result-row" data-action="picker-select" data-id="${item.id}">
      <div class="result-icon" style="background:var(--kho-bg); color:var(--kho);">${ICON.box}</div>
      <div class="result-main">
        <div class="result-title">${esc(item.name)} ${stock<0?`<span class="stock-pill low">Âm ${Math.abs(stock)}</span>`:''}</div>
        <div class="result-sub">Tồn kho: ${stock} · Nhập: ${fmtVND(item.import_price||0)}</div>
      </div>
      <div class="result-meta">Lẻ ${fmtVND(item.sell_price_retail||0)}</div>
    </div>`;
  }
  if(type==='khach'){
    return `<div class="result-row" data-action="picker-select" data-id="${item.id}">
      <div class="result-icon" style="background:#EAF0FB; color:#2C5289;">${ICON.user}</div>
      <div class="result-main">
        <div class="result-title">${esc(item.name)}</div>
        <div class="result-sub">${esc(item.phone||'Chưa có SĐT')} · ${item.customer_type==='si'?'Khách sỉ':'Khách lẻ'}</div>
      </div>
      <div class="result-meta">${item.debt?fmtVND(item.debt):''}</div>
    </div>`;
  }
  return `<div class="result-row" data-action="picker-select" data-id="${item.id}">
    <div class="result-icon" style="background:var(--doitac-bg); color:var(--doitac);">${ICON.truck}</div>
    <div class="result-main">
      <div class="result-title">${esc(item.name)}</div>
      <div class="result-sub">${esc(item.address||'Chưa có địa chỉ')}</div>
    </div>
    <div class="result-meta">${item.debt?fmtVND(item.debt):''}</div>
  </div>`;
}

const schedulePickerSearch = debounce(()=>{
  if(pickerWrap?.isConnected) pickerWrap.querySelector('#picker-list').innerHTML = loadingSkeleton(2);
  loadPickerItems();
}, 1000);

function wirePicker(){
  const input = pickerWrap.querySelector('#picker-search');
  if(!input) return;
  input.addEventListener('input', e=>{ pickerQuery = e.target.value; schedulePickerSearch(); });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function selectEntity(type, id){
  touched[type] = true;
  activeTab = type;
  const tb = document.getElementById('mainTabbar');
  if(tb) tb.innerHTML = tabbarHtml();
  requestCloseTopModal();
  ENTITY_META[type].open(id);
}

// ---------- Popup "+ Thêm sản phẩm mới" ngay trong lúc soạn đơn (Khách hàng/Đối tác) ----------
let qapDraft = null;
let qapCallback = null;
let qapWrap = null;

export function openQuickAddProductPopup(onCreated){
  qapDraft = { name:'', importPrice:0, stockQty:0, sellRetail:0, sellWholesale:0, errors:{} };
  qapCallback = onCreated;
  qapWrap = openModal(qapHtml());
  wireQap();
}

function qapHtml(){
  const d = qapDraft;
  const errors = d.errors||{};
  return `
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Thêm sản phẩm mới</div><div class="icon-btn" data-action="qap-cancel">${ICON.close}</div></div>
    <div class="modal-body">
      ${errors.any ? `<div class="form-warning">${ICON.warn} Vui lòng nhập tên sản phẩm.</div>` : ''}
      <div class="card">
        <div class="field">
          <div class="field-label">Tên sản phẩm</div>
          <input class="input ${errors.name?'error':''}" id="qap-name" value="${esc(d.name)}" placeholder="VD: Ốp lưng iPhone 16">
          ${errors.name?`<div class="field-error">${ICON.warn} Chưa nhập tên sản phẩm</div>`:''}
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Giá nhập</div><input class="input" type="number" id="qap-import" value="${d.importPrice||''}" placeholder="0"></div>
          <div class="field"><div class="field-label">Trong kho</div><input class="input" type="number" id="qap-stock" value="${d.stockQty||''}" placeholder="0"></div>
        </div>
        <div class="field-row">
          <div class="field"><div class="field-label">Giá bán lẻ</div><input class="input" type="number" id="qap-retail" value="${d.sellRetail||''}" placeholder="0"></div>
          <div class="field"><div class="field-label">Giá bán sỉ</div><input class="input" type="number" id="qap-wholesale" value="${d.sellWholesale||''}" placeholder="0"></div>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-action="qap-cancel">Hủy</button>
      <button class="btn btn-primary btn-block" data-action="qap-save">${ICON.check} Lưu sản phẩm</button>
    </div>
  `;
}

function wireQap(){
  const bind = (id, fn)=>{ const el = qapWrap.querySelector('#'+id); if(el) el.addEventListener('input', e=>fn(e.target.value)); };
  bind('qap-name', v=>qapDraft.name=v);
  bind('qap-import', v=>qapDraft.importPrice=parseFloat(v)||0);
  bind('qap-stock', v=>qapDraft.stockQty=parseInt(v)||0);
  bind('qap-retail', v=>qapDraft.sellRetail=parseFloat(v)||0);
  bind('qap-wholesale', v=>qapDraft.sellWholesale=parseFloat(v)||0);
}

async function saveQuickAddProduct(){
  const name = (qapDraft.name||'').trim();
  if(!name){
    qapDraft.errors = { name:true, any:true };
    rerenderTopModal(qapHtml());
    wireQap();
    return;
  }
  qapDraft.errors = {};
  try{
    const dup = await findByExactName('products', name);
    if(dup){
      openConfirmModal('Tên sản phẩm đã tồn tại', `Đã có sản phẩm tên "${name}" trong hệ thống. Vẫn muốn tạo thêm sản phẩm trùng tên?`, ()=>commitQuickAddProduct(name));
      return;
    }
  } catch(err){ /* không chặn tạo mới nếu kiểm tra trùng tên bị lỗi mạng */ }
  commitQuickAddProduct(name);
}

async function commitQuickAddProduct(name){
  try{
    const product = await createProduct({
      name,
      import_price: qapDraft.importPrice||0,
      stock_qty: qapDraft.stockQty||0,
      sell_price_retail: qapDraft.sellRetail||0,
      sell_price_wholesale: qapDraft.sellWholesale||0,
    });
    requestCloseTopModal();
    showToast(`Đã tạo sản phẩm "${name}".`, [], { icon:ICON.check });
    if(qapCallback) qapCallback(product);
  } catch(err){
    showToast('Không tạo được sản phẩm mới — kiểm tra lại kết nối mạng.', []);
  }
}

export function handleMainScreenAction(action, el){
  switch(action){
    case 'switch-tab': switchTab(el.dataset.type); return true;
    case 'open-picker': openPicker(el.dataset.type); return true;
    case 'picker-select': selectEntity(pickerType, el.dataset.id); return true;
    case 'picker-add-new': selectEntity(pickerType, null); return true;
    case 'picker-retry': loadPickerItems(); return true;
    case 'qap-save': saveQuickAddProduct(); return true;
    case 'qap-cancel': requestCloseTopModal(); return true;
  }
  return false;
}
