import { ICON } from './icons.js';
import { esc, fmtVND, facebookProfileUrl } from './utils.js';
import { openModal, rerenderTopModal, requestCloseTopModal, openConfirmModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import { searchQuery, resetSearchAndRefresh } from './home.js';
import { getCustomer, createCustomer, updateCustomer } from './api/customers.js';
import { findByExactName } from './supabaseClient.js';
import {
  getOrCreateDraftSO, listSOLines, addSOLine, updateSOLine, deleteSOLine,
  updatePendingDemandQty, cancelSalesOrder,
} from './api/salesOrders.js';
import { searchProductsByName, getLatestImportPriceMap } from './api/products.js';
import { notifySalesOrdersChanged } from './salesOrdersScreen.js';
import { openRestockModal } from './restockModal.js';

let customerId = null;
let isNewCustomer = false;
let customerDraft = null;       // {name, phone, address, type, errors}
let soRecord = null;            // sales_orders row (chỉ có khi khách hàng đã tồn tại)
let soLines = [];                // sales_order_lines đã join products/partners (khách cũ)
let localDraftLines = [];        // dòng hàng cục bộ, chưa lưu DB (khách mới, chưa commit)
let localLineSeq = 0;
let quickAddQuery = '';
let quickAddProducts = [];
let latestImportMap = {};
let modalLoadError = null;

export async function openCustomerModal(idOrNull){
  isNewCustomer = !idOrNull;
  customerId = idOrNull;
  modalLoadError = null;
  soRecord = null; soLines = []; localDraftLines = []; localLineSeq = 0;
  quickAddQuery = '';

  // Khách mới chỉ được tạo khi bấm nút "Tạo mới" — đóng popup theo cách khác (backdrop,
  // nút X, Hủy đơn) sẽ bỏ dở hoàn toàn, không tự lưu.
  openModal(loadingModalHtml(isNewCustomer ? 'Khách hàng mới' : 'Khách hàng'));

  try{
    const [products, importMap] = await Promise.all([ searchProductsByName(''), getLatestImportPriceMap() ]);
    quickAddProducts = products;
    latestImportMap = importMap;

    if(isNewCustomer){
      customerDraft = { name: searchQuery || '', phone:'', address:'', facebookId:'', type:'le', errors:{} };
    } else {
      const cust = await getCustomer(customerId);
      customerDraft = { name:cust.name, phone:cust.phone||'', address:cust.address||'', facebookId:cust.facebook_id||'', type:cust.customer_type, errors:{} };
      soRecord = await getOrCreateDraftSO(customerId);
      soLines = await listSOLines(soRecord.id);
    }
  } catch(err){
    modalLoadError = err;
  }
  paint();
}

function saveNewCustomerForm(){
  const typedName = (customerDraft.name||'').trim();
  if(!typedName){
    customerDraft.errors = { name:true, any:true };
    paint();
    return;
  }
  customerDraft.errors = {};
  checkDupThenCommitNewCustomer(typedName);
}

async function checkDupThenCommitNewCustomer(typedName){
  try{
    const dup = await findByExactName('customers', typedName);
    if(dup){
      openConfirmModal('Tên khách hàng đã tồn tại', `Đã có khách hàng tên "${typedName}" trong hệ thống. Vẫn muốn tạo thêm khách hàng trùng tên?`, ()=>commitNewCustomer(typedName));
      return;
    }
  } catch(err){ /* không chặn tạo mới nếu kiểm tra trùng tên bị lỗi mạng */ }
  commitNewCustomer(typedName);
}

async function commitNewCustomer(typedName){
  try{
    const newCust = await createCustomer({
      name: typedName,
      phone: (customerDraft.phone||'').trim(),
      address: (customerDraft.address||'').trim(),
      facebook_id: (customerDraft.facebookId||'').trim(),
      customer_type: customerDraft.type,
    });
    if(localDraftLines.length){
      const so = await getOrCreateDraftSO(newCust.id);
      for(const l of localDraftLines){
        await addSOLine({
          sales_order_id: so.id, product_id:l.productId, qty:l.qty, sell_price:l.sellPrice,
          source_type:'kho', partner_id:null, import_price_at_sale:l.importPriceAtSale,
        });
      }
      notifySalesOrdersChanged();
    }
    requestCloseTopModal();
    resetSearchAndRefresh();
    showToast(`Đã tạo khách hàng "${typedName}".`, [], { icon:ICON.check });
  } catch(err){
    showToast(`Không lưu được khách hàng "${typedName}" — kiểm tra lại kết nối mạng.`, []);
  }
}

function loadingModalHtml(title){
  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div class="modal-title">${esc(title)}</div>
      <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
    </div>
    <div class="modal-body"><div class="card">${loadingSkeleton(4)}</div></div>
  `;
}

function paint(){
  rerenderTopModal(customerModalHtml());
  wireInputs();
}

function displayLines(){
  if(isNewCustomer){
    return localDraftLines.map(l=>({
      id: l.localId, productId:l.productId, productName:l.productName,
      qty:l.qty, sellPrice:l.sellPrice,
      latestImportPrice:l.latestImportPrice, stockQty:l.stockQty,
    }));
  }
  return soLines.map(l=>({
    id:l.id, productId:l.product_id, productName:l.products?.name,
    qty:l.qty, sellPrice:l.sell_price,
    latestImportPrice: latestImportMap[l.product_id]!=null ? latestImportMap[l.product_id] : l.products?.import_price,
    stockQty:l.products?.stock_qty||0,
  }));
}
function currentTotal(){
  return displayLines().reduce((s,l)=> s + l.qty*l.sellPrice, 0);
}

function customerModalHtml(){
  if(modalLoadError){
    return `
      <div class="modal-handle"></div>
      <div class="modal-head"><div class="modal-title">Khách hàng</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
      <div class="modal-body">${errorBanner('Không tải được dữ liệu khách hàng — kiểm tra lại kết nối mạng.', { retryAction:'retry-customer-modal' })}</div>
    `;
  }
  if(!customerDraft) return loadingModalHtml('Khách hàng');

  const d = customerDraft;
  const errors = d.errors || {};
  const lines = displayLines();
  const total = currentTotal();
  const isNewUnsaved = isNewCustomer;
  const canCall = !isNewUnsaved;

  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div class="modal-title">${isNewUnsaved ? 'Khách hàng mới' : esc(d.name||'Khách hàng')}</div>
      <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
    </div>
    <div class="modal-body">
      ${errors.any ? `<div class="form-warning">${ICON.warn} Cần nhập Tên khách hàng.</div>` : ''}
      <div class="card">
        <div class="field">
          <div class="field-label">Tên khách hàng</div>
          <input class="input ${errors.name?'error':''}" id="cf-name" value="${esc(d.name)}" placeholder="VD: Chị Mai">
          ${errors.name?`<div class="field-error">${ICON.warn} Chưa nhập tên khách hàng</div>`:''}
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Số điện thoại</div>
            <input class="input" id="cf-phone" value="${esc(d.phone)}" placeholder="VD: 0912345678 (không bắt buộc)">
          </div>
          ${canCall && d.phone ? `
          <div style="display:flex; align-items:flex-end; gap:8px; padding-bottom:1px;">
            <a class="round-btn call" href="tel:${d.phone}">${ICON.phone}</a>
            <a class="round-btn zalo" href="https://zalo.me/${d.phone}" target="_blank" rel="noopener">Z</a>
          </div>` : ''}
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">ID / link Facebook</div>
            <input class="input" id="cf-facebook" value="${esc(d.facebookId)}" placeholder="VD: nguyen.van.a hoặc 100012345678 (không bắt buộc)">
            <div class="field-note">Dùng để mở Messenger gửi bill từ màn Đơn bán.</div>
          </div>
          ${canCall && d.facebookId ? `
          <div style="display:flex; align-items:flex-end; padding-bottom:1px;">
            <a class="round-btn facebook" href="${facebookProfileUrl(d.facebookId)}" target="_blank" rel="noopener">${ICON.facebook}</a>
          </div>` : ''}
        </div>
        <div class="field">
          <div class="field-label">Địa chỉ</div>
          <input class="input" id="cf-address" value="${esc(d.address)}" placeholder="Không bắt buộc">
        </div>
        <div class="field">
          <div class="field-label">Loại khách hàng</div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn ${d.type==='le'?'btn-primary':'btn-ghost'}" style="flex:1;" data-action="set-customer-type" data-type="le">Bán lẻ</button>
            <button type="button" class="btn ${d.type==='si'?'btn-primary':'btn-ghost'}" style="flex:1;" data-action="set-customer-type" data-type="si">Bán sỉ</button>
          </div>
          <div class="field-note">Quyết định giá bán mặc định khi thêm sản phẩm vào đơn (giá lẻ hoặc giá sỉ).</div>
        </div>
      </div>

      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Sản phẩm trong đơn (${lines.length})</div>
        <div id="so-lines">${renderSOLines(lines)}</div>
        ${!lines.length?`<div class="field-note">Chưa có sản phẩm — tìm và thêm ở dưới.</div>`:''}
        <div class="order-total-bar">
          <div class="order-total-label">Tổng tiền đơn</div>
          <div class="order-total-value">${fmtVND(total)}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">
          ${ICON.search}
          <input id="qa-search" placeholder="Tìm sản phẩm…" value="${esc(quickAddQuery)}" autocomplete="off">
        </div>
      </div>

      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Thêm sản phẩm nhanh</div>
        <div id="qa-list">${renderQuickAdd()}</div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger-ghost" data-action="cancel-so">${ICON.x} Hủy đơn</button>
      ${isNewUnsaved
        ? `<button class="btn btn-primary btn-block" data-action="create-customer">${ICON.check} Tạo mới</button>`
        : `<button class="btn btn-primary btn-block" data-action="save-customer">${ICON.check} Lưu thay đổi</button>`
      }
    </div>
  `;
}

function renderSOLines(lines){
  return lines.map(l=>{
    const short = l.stockQty < l.qty;
    return `
    <div class="line-row">
      <div class="line-top">
        <div class="line-name">${esc(l.productName)}</div>
        <div class="line-remove" data-action="so-remove-line" data-lineid="${l.id}">${ICON.trash}</div>
      </div>
      <div class="line-bottom">
        <div class="qty-stepper">
          <div class="qty-btn" data-action="so-qty" data-lineid="${l.id}" data-delta="-1">${ICON.minus}</div>
          <input class="qty-input" type="number" min="1" value="${l.qty}" data-field="so-qty-input" data-lineid="${l.id}">
          <div class="qty-btn" data-action="so-qty" data-lineid="${l.id}" data-delta="1">${ICON.plus}</div>
        </div>
        <div class="price-edit">
          <input class="price-input" type="number" value="${l.sellPrice}" data-field="so-price" data-lineid="${l.id}">
        </div>
        <div class="line-total">${fmtVND(l.qty*l.sellPrice)}</div>
      </div>
      <div class="line-refnote with-stock">
        <span>Giá nhập gần nhất: ${fmtVND(l.latestImportPrice||0)}</span>
        <span class="stock-pill ${short?'low':'ok'}">Tồn kho: ${l.stockQty}</span>
        ${short?`<button type="button" class="restock-btn" data-action="open-restock" data-productid="${l.productId}" data-orderqty="${l.qty}">${ICON.warn} Nhập hàng</button>`:''}
      </div>
    </div>
  `;
  }).join('');
}

function renderQuickAdd(){
  const q = (quickAddQuery||'').toLowerCase();
  let products = quickAddProducts;
  if(q) products = products.filter(p=>p.name.toLowerCase().includes(q));
  if(!products.length) return `<div class="field-note">Không tìm thấy sản phẩm phù hợp.</div>`;
  const custType = customerDraft.type;
  return products.map(p=>{
    const price = custType==='si' ? p.sell_price_wholesale : p.sell_price_retail;
    return `<div class="quickadd-row" data-action="so-add-line" data-productid="${p.id}">
      <div class="quickadd-left"><span class="dot dot-kho"></span>
        <div><div class="quickadd-name">${esc(p.name)}</div><div class="quickadd-price">${fmtVND(price)} · tồn ${p.stock_qty||0}</div></div>
      </div>
      <div class="quickadd-add">${ICON.plus}</div>
    </div>`;
  }).join('');
}

function wireInputs(){
  const byId = id=>document.getElementById(id);
  const nameEl = byId('cf-name'); if(nameEl) nameEl.addEventListener('input', e=>{ customerDraft.name = e.target.value; });
  const phoneEl = byId('cf-phone'); if(phoneEl) phoneEl.addEventListener('input', e=>{ customerDraft.phone = e.target.value; });
  const fbEl = byId('cf-facebook'); if(fbEl) fbEl.addEventListener('input', e=>{ customerDraft.facebookId = e.target.value; });
  const addrEl = byId('cf-address'); if(addrEl) addrEl.addEventListener('input', e=>{ customerDraft.address = e.target.value; });
  const qaEl = byId('qa-search');
  if(qaEl) qaEl.addEventListener('input', e=>{
    quickAddQuery = e.target.value;
    document.getElementById('qa-list').innerHTML = renderQuickAdd();
  });
  document.querySelectorAll('[data-field="so-qty-input"]').forEach(el=>{
    el.addEventListener('input', e=> soSetQty(el.dataset.lineid, e.target.value));
  });
  document.querySelectorAll('[data-field="so-price"]').forEach(el=>{
    el.addEventListener('input', e=> soSetPrice(el.dataset.lineid, e.target.value));
  });
}

// ---------- Hành động dòng hàng trong đơn ----------
function findProductCache(productId){
  return quickAddProducts.find(p=>p.id===productId);
}

async function soAddLine(productId){
  const p = findProductCache(productId);
  if(!p) return;
  const custType = customerDraft.type;
  const sellPrice = custType==='si' ? p.sell_price_wholesale : p.sell_price_retail;
  const importPriceAtSale = p.import_price || 0;

  if(isNewCustomer){
    localDraftLines.push({
      localId: 'local-'+(++localLineSeq), productId, productName:p.name, qty:1, sellPrice,
      latestImportPrice: latestImportMap[productId]!=null ? latestImportMap[productId] : p.import_price,
      stockQty: p.stock_qty||0, importPriceAtSale,
    });
    paint();
    return;
  }
  try{
    const line = await addSOLine({
      sales_order_id: soRecord.id, product_id:productId, qty:1, sell_price:sellPrice,
      source_type:'kho', partner_id:null, import_price_at_sale:importPriceAtSale,
    });
    soLines.push(line);
    paint();
  } catch(err){
    showToast('Không thêm được sản phẩm vào đơn — kiểm tra lại kết nối mạng.', []);
  }
}

async function soRemoveLine(lineId){
  if(isNewCustomer){
    localDraftLines = localDraftLines.filter(l=>l.localId!==lineId);
    paint();
    return;
  }
  try{
    await deleteSOLine(lineId);
    soLines = soLines.filter(l=>l.id!==lineId);
    notifySalesOrdersChanged();
    paint();
  } catch(err){
    showToast('Không xoá được dòng hàng — kiểm tra lại kết nối mạng.', []);
  }
}

async function soChangeQty(lineId, delta){
  const current = displayLines().find(l=>l.id===lineId);
  if(!current) return;
  await soSetQty(lineId, Math.max(1, current.qty + delta));
}

async function soSetQty(lineId, val){
  const qty = Math.max(1, parseInt(val)||1);
  if(isNewCustomer){
    const line = localDraftLines.find(l=>l.localId===lineId);
    if(line) line.qty = qty;
    paint();
    return;
  }
  try{
    const idx = soLines.findIndex(l=>l.id===lineId);
    if(idx===-1) return;
    const updated = await updateSOLine(lineId, { qty });
    soLines[idx] = updated;
    if(updated.source_type==='partner'){
      await updatePendingDemandQty(lineId, qty);
      notifySalesOrdersChanged();
    }
    paint();
  } catch(err){
    showToast('Không cập nhật được số lượng — kiểm tra lại kết nối mạng.', []);
  }
}

async function soSetPrice(lineId, val){
  const price = Math.max(0, parseFloat(val)||0);
  if(isNewCustomer){
    const line = localDraftLines.find(l=>l.localId===lineId);
    if(line) line.sellPrice = price;
    return; // không cần re-render toàn modal khi gõ giá, tránh mất focus
  }
  try{
    const idx = soLines.findIndex(l=>l.id===lineId);
    if(idx===-1) return;
    const updated = await updateSOLine(lineId, { sell_price: price });
    soLines[idx] = updated;
  } catch(err){
    showToast('Không cập nhật được giá — kiểm tra lại kết nối mạng.', []);
  }
}

// ---------- Loại khách hàng ----------
async function setCustomerType(newType){
  if(customerDraft.type === newType) return;
  const oldType = customerDraft.type;
  const beforeLines = displayLines().map(l=>({ id:l.id, sellPrice:l.sellPrice }));

  customerDraft.type = newType;
  if(isNewCustomer){
    localDraftLines.forEach(l=>{ l.sellPrice = newType==='si' ? l.sellPriceWholesale : l.sellPriceRetail; });
    paint();
    showUndoTypeToast(newType, oldType, beforeLines);
    return;
  }

  try{
    await updateCustomer(customerId, { customer_type:newType });
    await Promise.all(soLines.map(async l=>{
      const newPrice = newType==='si' ? l.products?.sell_price_wholesale : l.products?.sell_price_retail;
      const idx = soLines.findIndex(x=>x.id===l.id);
      soLines[idx] = await updateSOLine(l.id, { sell_price: newPrice });
    }));
    paint();
    showUndoTypeToast(newType, oldType, beforeLines);
  } catch(err){
    customerDraft.type = oldType;
    showToast('Không đổi được loại khách hàng — kiểm tra lại kết nối mạng.', []);
    paint();
  }
}

function showUndoTypeToast(newType, oldType, beforeLines){
  const label = newType==='si' ? 'Bán sỉ' : 'Bán lẻ';
  showToast(`Đã đổi sang "${label}" — đơn giá các sản phẩm trong đơn đã cập nhật.`, [], { icon:ICON.check, undo: async ()=>{
    customerDraft.type = oldType;
    if(isNewCustomer){
      beforeLines.forEach(b=>{ const line = localDraftLines.find(x=>x.localId===b.id); if(line) line.sellPrice = b.sellPrice; });
      paint();
    } else {
      try{
        await updateCustomer(customerId, { customer_type:oldType });
        await Promise.all(beforeLines.map(async b=>{
          const idx = soLines.findIndex(x=>x.id===b.id);
          if(idx!==-1) soLines[idx] = await updateSOLine(b.id, { sell_price: b.sellPrice });
        }));
      } catch(err){ /* bỏ qua lỗi hoàn tác phụ */ }
      paint();
    }
    showToast('Đã hoàn tác đổi loại khách hàng.', []);
  }});
}

// ---------- Lưu / Hủy đơn ----------
function saveCustomerForm(){
  const d = customerDraft;
  if(!d.name.trim()){
    d.errors = { name:true, any:true };
    paint();
    return;
  }
  d.errors = {};
  commitCustomerSave();
}

async function commitCustomerSave(){
  const d = customerDraft;
  try{
    const before = await getCustomer(customerId);
    const updated = await updateCustomer(customerId, {
      name: d.name.trim(), phone: d.phone.trim(), address: d.address.trim(),
      facebook_id: d.facebookId.trim(), customer_type: d.type,
    });
    requestCloseTopModal();
    resetSearchAndRefresh();
    showToast(`Đã cập nhật "${updated.name}".`, [], { icon:ICON.check, undo: async ()=>{
      try{
        await updateCustomer(customerId, { name:before.name, phone:before.phone, address:before.address, facebook_id:before.facebook_id, customer_type:before.customer_type });
        resetSearchAndRefresh();
        showToast(`Đã hoàn tác thay đổi cho "${before.name}".`, []);
      } catch(err){
        showToast('Không hoàn tác được — kiểm tra lại kết nối mạng.', []);
      }
    }});
  } catch(err){
    showToast('Không lưu được thay đổi — kiểm tra lại kết nối mạng và thử lại.', []);
  }
}

function confirmCancelSO(){
  const label = isNewCustomer ? (customerDraft.name||'khách này') : (customerDraft?.name||'khách này');
  openConfirmModal('Hủy đơn hàng?', `Bạn có chắc muốn hủy đơn hàng của "${esc(label)}" không? Không thể hoàn tác thao tác này.`, async ()=>{
    if(isNewCustomer){
      localDraftLines = [];
      requestCloseTopModal();
      return;
    }
    try{
      await cancelSalesOrder(soRecord.id);
      notifySalesOrdersChanged();
      requestCloseTopModal();
    } catch(err){
      showToast('Không hủy được đơn hàng — kiểm tra lại kết nối mạng.', []);
    }
  });
}

function handleRestocked({ productId, stockQty, importPrice }){
  const cached = quickAddProducts.find(p=>p.id===productId);
  if(cached){
    cached.stock_qty = stockQty;
    if(importPrice!=null) cached.import_price = importPrice;
  }
  if(importPrice!=null) latestImportMap[productId] = importPrice;
  if(isNewCustomer){
    localDraftLines.forEach(l=>{
      if(l.productId===productId){
        l.stockQty = stockQty;
        if(importPrice!=null) l.latestImportPrice = importPrice;
      }
    });
  } else {
    soLines.forEach(l=>{
      if(l.product_id===productId && l.products){
        l.products.stock_qty = stockQty;
        if(importPrice!=null) l.products.import_price = importPrice;
      }
    });
  }
  paint();
}

export function handleCustomerModalAction(action, el){
  switch(action){
    case 'so-remove-line': soRemoveLine(el.dataset.lineid); return true;
    case 'so-qty': soChangeQty(el.dataset.lineid, parseInt(el.dataset.delta)); return true;
    case 'so-add-line': soAddLine(el.dataset.productid); return true;
    case 'set-customer-type': setCustomerType(el.dataset.type); return true;
    case 'save-customer': saveCustomerForm(); return true;
    case 'create-customer': saveNewCustomerForm(); return true;
    case 'cancel-so': confirmCancelSO(); return true;
    case 'retry-customer-modal': openCustomerModal(customerId); return true;
    case 'open-restock': openRestockModal(el.dataset.productid, parseInt(el.dataset.orderqty), handleRestocked); return true;
  }
  return false;
}
