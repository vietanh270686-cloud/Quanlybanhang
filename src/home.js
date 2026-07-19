import { ICON } from './icons.js';
import { esc, fmtDate } from './utils.js';
import { getHomeCounts } from './api/dashboard.js';
import { searchAll } from './api/search.js';
import { loadingSkeleton, errorBanner } from './modal.js';

export let searchQuery = '';
let homeCounts = null;
let homeCountsError = null;

export function clearSearch(){
  searchQuery = '';
  refreshHomeShell();
}

// Dùng sau khi tạo/sửa xong 1 bản ghi từ popup: về lại màn hình chính và tải lại số liệu tổng quan
export function resetSearchAndRefresh(){
  searchQuery = '';
  renderHome();
}

export async function renderHome(){
  const el = document.getElementById('homeView');
  el.innerHTML = shellHtml({ loading:true });
  wireSearchInput();

  try{
    homeCounts = await getHomeCounts();
    homeCountsError = null;
  } catch(err){
    homeCountsError = err;
  }
  // nếu người dùng đã gõ tìm kiếm trong lúc đang tải, không ghi đè kết quả tìm kiếm
  if(!searchQuery) el.innerHTML = shellHtml({ loading:false });
  wireSearchInput();
}

export function refreshHomeShell(){
  const el = document.getElementById('homeView');
  el.innerHTML = shellHtml({ loading:false });
  wireSearchInput();
}

function shellHtml({ loading }){
  return `
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

    <div class="search-wrap">
      <div class="search-box">
        ${ICON.search}
        <input id="searchInput" type="text" placeholder="Tìm sản phẩm, khách hàng, đối tác…" value="${esc(searchQuery)}" autocomplete="off">
        <div class="search-clear ${searchQuery?'show':''}" data-action="clear-search">${ICON.close}</div>
      </div>
    </div>

    <div id="resultsWrap">${searchQuery ? `<div class="results"><div class="loading-center">Đang tìm…</div></div>` : ''}</div>

    ${!searchQuery ? renderMainIcons(loading) : ''}
    ${!searchQuery ? renderBottomIcons(loading) : ''}
  `;
}

function wireSearchInput(){
  const input = document.getElementById('searchInput');
  if(!input) return;
  input.addEventListener('input', async e=>{
    searchQuery = e.target.value;
    const resultsWrap = document.getElementById('resultsWrap');
    document.querySelector('.search-clear').classList.toggle('show', !!searchQuery);
    let mi = document.querySelector('.main-icons'), bi = document.querySelector('.bottom-icons'), bif = document.querySelector('.bottom-icons-full'), hb = document.querySelector('.hint-banner');
    if(mi) mi.style.display = searchQuery ? 'none' : 'grid';
    if(bi) bi.style.display = searchQuery ? 'none' : 'grid';
    if(bif) bif.style.display = searchQuery ? 'none' : 'block';
    if(hb) hb.style.display = searchQuery ? 'none' : 'flex';
    if(!searchQuery){ resultsWrap.innerHTML = ''; return; }
    resultsWrap.innerHTML = `<div class="results"><div class="loading-center">Đang tìm…</div></div>`;
    const myQuery = searchQuery;
    try{
      const results = await searchAll(myQuery);
      if(myQuery !== searchQuery) return; // người dùng đã gõ tiếp, bỏ kết quả cũ
      resultsWrap.innerHTML = renderResults(results);
    } catch(err){
      if(myQuery !== searchQuery) return;
      resultsWrap.innerHTML = `<div class="results">${errorBanner('Không tìm kiếm được — kiểm tra lại kết nối mạng.')}</div>`;
    }
  });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function renderResults(results){
  const hasResults = results.products.length || results.customers.length || results.partners.length;
  if(!hasResults){
    return `<div class="results"><div class="no-results">
      Không tìm thấy kết quả phù hợp.<br>
      <button class="btn btn-primary btn-sm" data-action="create-from-search">${ICON.plus} Tạo sản phẩm mới "${esc(searchQuery)}"</button>
    </div></div>`;
  }
  let html = '<div class="results">';
  if(results.products.length){
    html += `<div class="results-group-label">Sản phẩm</div>`;
    results.products.forEach(p=>{
      html += `<div class="result-row" data-action="open-product" data-id="${p.id}">
        <div class="result-icon" style="background:var(--kho-bg); color:var(--kho);">${ICON.box}</div>
        <div class="result-main">
          <div class="result-title">${esc(p.name)}</div>
          <div class="result-sub">Nhập gần nhất: ${(p.latestPartner?p.latestPartner.price:p.import_price||0).toLocaleString('vi-VN')}₫${p.latestPartner?' · '+esc(p.latestPartner.partnerName||''):''}</div>
        </div>
        <div class="result-meta">Lẻ ${(p.sell_price_retail||0).toLocaleString('vi-VN')}₫<br><span style="font-weight:600; color:var(--ink-faint); font-size:11px;">Sỉ ${(p.sell_price_wholesale||0).toLocaleString('vi-VN')}₫</span></div>
      </div>`;
    });
  }
  if(results.customers.length){
    html += `<div class="results-group-label">Khách hàng</div>`;
    results.customers.forEach(c=>{
      html += `<div class="result-row" data-action="open-customer" data-id="${c.id}">
        <div class="result-icon" style="background:#EAF0FB; color:#2C5289;">${ICON.user}</div>
        <div class="result-main">
          <div class="result-title">${esc(c.name)}</div>
          <div class="result-sub">${esc(c.phone||'Chưa có SĐT')}</div>
        </div>
      </div>`;
    });
  }
  if(results.partners.length){
    html += `<div class="results-group-label">Đối tác</div>`;
    results.partners.forEach(p=>{
      html += `<div class="result-row" data-action="open-partner" data-id="${p.id}">
        <div class="result-icon" style="background:var(--doitac-bg); color:var(--doitac);">${ICON.truck}</div>
        <div class="result-main">
          <div class="result-title">${esc(p.name)}</div>
          <div class="result-sub">${esc(p.address||'Chưa có địa chỉ')}</div>
        </div>
      </div>`;
    });
  }
  html += '</div>';
  return html;
}

function renderMainIcons(loading){
  if(loading){
    return `<div style="padding:18px 16px 6px;">${loadingSkeleton(1)}</div>`;
  }
  if(homeCountsError){
    return errorBanner('Không tải được dữ liệu tổng quan — kiểm tra lại kết nối mạng.', { retryAction:'retry-home' });
  }
  const c = homeCounts;
  return `
  <div class="main-icons">
    <div class="icon-tile" data-action="open-product-menu">
      <div class="icon-circle" style="background:var(--kho-bg); color:var(--kho);">${ICON.box}</div>
      <div class="icon-tile-label">Sản phẩm</div>
      <div class="icon-tile-count">${c.products} mặt hàng</div>
    </div>
    <div class="icon-tile" data-action="open-customer-menu">
      <div class="icon-circle" style="background:#EAF0FB; color:#2C5289;">${ICON.user}</div>
      <div class="icon-tile-label">Khách hàng</div>
      <div class="icon-tile-count">${c.customers} khách</div>
    </div>
    <div class="icon-tile" data-action="open-partner-menu">
      <div class="icon-circle" style="background:var(--doitac-bg); color:var(--doitac);">${ICON.truck}</div>
      <div class="icon-tile-label">Đối tác</div>
      <div class="icon-tile-count">${c.partners} đối tác</div>
    </div>
    <div class="icon-tile" data-action="open-warehouse">
      <div class="icon-circle" style="background:#F1EAFB; color:#6B4FA0;">${ICON.warehouse}</div>
      <div class="icon-tile-label">Kho hàng</div>
      <div class="icon-tile-count">&nbsp;</div>
    </div>
  </div>`;
}

function renderBottomIcons(loading){
  if(loading || homeCountsError) return '';
  const c = homeCounts;
  return `
  <div class="bottom-icons">
    <div class="wide-tile" data-action="open-sales-screen">
      ${c.soToday?`<div class="wide-tile-badge">${c.soToday}</div>`:''}
      <div class="wide-tile-icon">${ICON.receipt}</div>
      <div class="wide-tile-text">
        <div class="wide-tile-label">Đơn bán</div>
        <div class="wide-tile-sub">Quản lý & chốt đơn</div>
      </div>
    </div>
    <div class="wide-tile secondary" data-action="open-purchase-screen">
      ${c.poToday?`<div class="wide-tile-badge">${c.poToday}</div>`:''}
      <div class="wide-tile-icon">${ICON.cart}</div>
      <div class="wide-tile-text">
        <div class="wide-tile-label">Hàng nhập hôm nay</div>
        <div class="wide-tile-sub">Quản lý & chốt đơn</div>
      </div>
    </div>
  </div>
  <div class="bottom-icons-full">
    <div class="wide-tile debt" data-action="open-debt-screen">
      ${c.debtTotalCount?`<div class="wide-tile-badge">${c.debtTotalCount}</div>`:''}
      <div class="wide-tile-icon">${ICON.debt}</div>
      <div class="wide-tile-text">
        <div class="wide-tile-label">Quản lý công nợ</div>
        <div class="wide-tile-sub">Công nợ khách hàng & đối tác</div>
      </div>
    </div>
  </div>
  ${c.demandOpen ? `<div class="hint-banner">${ICON.warn}<div><b>${c.demandOpen} dòng hàng đang "Chờ nhập"</b> từ các đơn bán — vào mục Đối tác tương ứng để xem gợi ý số lượng cần nhập.</div></div>` : ''}
  `;
}
