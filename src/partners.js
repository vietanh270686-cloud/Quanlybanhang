import { ICON } from './icons.js';
import { esc, fmtVND, timeAgo, facebookProfileUrl } from './utils.js';
import { openModal, rerenderTopModal, requestCloseTopModal, openConfirmModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import { resetSearchAndRefresh } from './home.js';
import { getPartner, createPartner, updatePartner, upsertPartnerContact } from './api/partners.js';
import {
  getOrCreateDraftPO, listPOLines, addPOLine, updatePOLine, deletePOLine,
  cancelPurchaseOrder, aggregatedDemandForPartner,
} from './api/purchaseOrders.js';
import { searchProductsByName, getPartnerPrice, getProductHistoryForPartner } from './api/products.js';
import { notifyPurchaseOrdersChanged } from './purchaseOrdersScreen.js';

let partnerId = null;
let isNewPartner = false;
let partnerDraft = null;      // {name, seller1:{name,phone}, seller2:{name,phone}, address, errors}
let poRecord = null;
let poLines = [];              // purchase_order_lines join products (đối tác cũ)
let localDraftLines = [];      // dòng cục bộ chưa lưu DB (đối tác mới)
let localLineSeq = 0;
let quickAddQuery = '';
let quickAddProducts = [];
let productHistoryIds = [];    // id sản phẩm đối tác này đã từng bán, gần nhất trước
let demandMap = {};             // { productId: {productId, productName, qty} } — chỉ có ở đối tác cũ
let modalLoadError = null;

export async function openPartnerModal(idOrNull){
  isNewPartner = !idOrNull;
  partnerId = idOrNull;
  modalLoadError = null;
  poRecord = null; poLines = []; localDraftLines = []; localLineSeq = 0;
  quickAddQuery = ''; demandMap = {}; productHistoryIds = [];

  openModal(loadingModalHtml(isNewPartner ? 'Đối tác mới' : 'Đối tác'), {
    onBeforeClose: onPartnerModalClose,
  });

  try{
    quickAddProducts = await searchProductsByName('');

    if(isNewPartner){
      partnerDraft = { name:'', seller1:{name:'',phone:''}, seller2:{name:'',phone:''}, address:'', facebookId:'', errors:{} };
    } else {
      const partner = await getPartner(partnerId);
      const c1 = (partner.partner_contacts||[]).find(c=>c.seq===1) || {name:'',phone:''};
      const c2 = (partner.partner_contacts||[]).find(c=>c.seq===2) || {name:'',phone:''};
      partnerDraft = {
        name: partner.name,
        seller1: { name:c1.name||'', phone:c1.phone||'' },
        seller2: { name:c2.name||'', phone:c2.phone||'' },
        address: partner.address||'',
        facebookId: partner.facebook_id||'',
        errors: {},
      };
      const hist = await getProductHistoryForPartner(partnerId);
      productHistoryIds = hist.map(h=>h.productId);
      poRecord = await getOrCreateDraftPO(partnerId);
      poLines = await listPOLines(poRecord.id);
      demandMap = await aggregatedDemandForPartner(partnerId);
    }
  } catch(err){
    modalLoadError = err;
  }
  paint();
}

function onPartnerModalClose(){
  if(!isNewPartner) return;
  const typedName = (partnerDraft.name||'').trim();
  if(!typedName) return;
  commitNewPartner(typedName);
}

async function commitNewPartner(typedName){
  try{
    const newPartner = await createPartner({ name: typedName, address:(partnerDraft.address||'').trim(), facebook_id:(partnerDraft.facebookId||'').trim() });
    await Promise.all([
      upsertPartnerContact(newPartner.id, 1, { name:(partnerDraft.seller1.name||'').trim(), phone:(partnerDraft.seller1.phone||'').trim() }),
      upsertPartnerContact(newPartner.id, 2, { name:(partnerDraft.seller2.name||'').trim(), phone:(partnerDraft.seller2.phone||'').trim() }),
    ]);
    if(localDraftLines.length){
      const po = await getOrCreateDraftPO(newPartner.id);
      for(const l of localDraftLines){
        await addPOLine({ purchase_order_id: po.id, product_id:l.productId, qty:l.qty, import_price:l.importPrice });
      }
      notifyPurchaseOrdersChanged();
    }
    resetSearchAndRefresh();
    showToast(`Đã tạo đối tác "${typedName}".`, [], { icon:ICON.check });
  } catch(err){
    showToast(`Không lưu được đối tác "${typedName}" — kiểm tra lại kết nối mạng.`, []);
  }
}

function loadingModalHtml(title){
  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div class="modal-title">${esc(title)}</div>
      <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
    </div>
    <div class="modal-body"><div class="card">${loadingSkeleton(5)}</div></div>
  `;
}

function paint(){
  rerenderTopModal(partnerModalHtml());
  wireInputs();
}

function displayLines(){
  if(isNewPartner){
    return localDraftLines.map(l=>({ id:l.localId, productId:l.productId, productName:l.productName, qty:l.qty, importPrice:l.importPrice }));
  }
  return poLines.map(l=>({ id:l.id, productId:l.product_id, productName:l.products?.name, qty:l.qty, importPrice:l.import_price }));
}
function currentTotal(){
  return displayLines().reduce((s,l)=> s + l.qty*l.importPrice, 0);
}

function partnerModalHtml(){
  if(modalLoadError){
    return `
      <div class="modal-handle"></div>
      <div class="modal-head"><div class="modal-title">Đối tác</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
      <div class="modal-body">${errorBanner('Không tải được dữ liệu đối tác — kiểm tra lại kết nối mạng.', { retryAction:'retry-partner-modal' })}</div>
    `;
  }
  if(!partnerDraft) return loadingModalHtml('Đối tác');

  const d = partnerDraft;
  const errors = d.errors || {};
  const lines = displayLines();
  const total = currentTotal();
  const isNewUnsaved = isNewPartner;
  const canCall = !isNewUnsaved;
  const demandEntries = Object.values(demandMap).filter(e=>e.qty>0);

  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div class="modal-title">${isNewUnsaved ? 'Đối tác mới' : esc(d.name||'Đối tác')}</div>
      <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
    </div>
    <div class="modal-body">
      ${errors.any ? `<div class="form-warning">${ICON.warn} Cần nhập Tên đối tác.</div>` : ''}
      <div class="card">
        <div class="field">
          <div class="field-label">Tên đối tác</div>
          <input class="input ${errors.name?'error':''}" id="ptf-name" value="${esc(d.name)}" placeholder="VD: Công ty TNHH ABC">
          ${errors.name?`<div class="field-error">${ICON.warn} Chưa nhập tên đối tác</div>`:''}
        </div>

        <div class="field-label" style="margin-top:2px;">Người bán 1 <span style="text-transform:none; font-weight:500; color:var(--ink-faint);">(không bắt buộc)</span></div>
        <div class="field-row">
          <div class="field"><input class="input" id="ptf-s1-name" value="${esc(d.seller1.name)}" placeholder="Tên người bán"></div>
          <div class="field"><input class="input" id="ptf-s1-phone" value="${esc(d.seller1.phone)}" placeholder="SĐT"></div>
          ${canCall && d.seller1.phone ? `
          <div style="display:flex; align-items:center; gap:8px;">
            <a class="round-btn call" href="tel:${d.seller1.phone}">${ICON.phone}</a>
            <a class="round-btn zalo" href="https://zalo.me/${d.seller1.phone}" target="_blank" rel="noopener">Z</a>
          </div>` : ''}
        </div>

        <div class="field-label">Người bán 2 <span style="text-transform:none; font-weight:500; color:var(--ink-faint);">(không bắt buộc)</span></div>
        <div class="field-row">
          <div class="field"><input class="input" id="ptf-s2-name" value="${esc(d.seller2.name)}" placeholder="Tên người bán"></div>
          <div class="field"><input class="input" id="ptf-s2-phone" value="${esc(d.seller2.phone)}" placeholder="SĐT"></div>
          ${canCall && d.seller2.phone ? `
          <div style="display:flex; align-items:center; gap:8px;">
            <a class="round-btn call" href="tel:${d.seller2.phone}">${ICON.phone}</a>
          </div>` : ''}
        </div>

        <div class="field">
          <div class="field-label">Địa chỉ</div>
          <input class="input" id="ptf-address" value="${esc(d.address)}" placeholder="Không bắt buộc">
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">ID / link Facebook</div>
            <input class="input" id="ptf-facebook" value="${esc(d.facebookId)}" placeholder="VD: nguyen.van.a hoặc 100012345678 (không bắt buộc)">
            <div class="field-note">Dùng để mở Messenger gửi bill từ màn Đơn bán.</div>
          </div>
          ${canCall && d.facebookId ? `
          <div style="display:flex; align-items:flex-end; padding-bottom:1px;">
            <a class="round-btn facebook" href="${facebookProfileUrl(d.facebookId)}" target="_blank" rel="noopener">${ICON.facebook}</a>
          </div>` : ''}
        </div>
      </div>

      ${demandEntries.length ? `
      <div class="demand-banner">
        <div class="demand-head">${ICON.lightning} Gợi ý cần nhập (cộng dồn từ đơn bán đang chờ)</div>
        ${demandEntries.map(e=>`<div class="demand-item"><span>${esc(e.productName)}</span><b>${e.qty}</b></div>`).join('')}
        <button class="btn btn-kho btn-sm demand-apply btn-block" data-action="apply-demand">${ICON.check} Thêm tất cả vào đơn mua</button>
      </div>` : ''}

      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Sản phẩm đang mua (${lines.length})</div>
        <div id="po-lines">${renderPOLines(lines)}</div>
        ${!lines.length?`<div class="field-note">Chưa có sản phẩm — tìm và thêm ở dưới, hoặc dùng gợi ý phía trên.</div>`:''}
        <div class="order-total-bar">
          <div class="order-total-label">Tổng tiền đơn</div>
          <div class="order-total-value">${fmtVND(total)}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">
          ${ICON.search}
          <input id="qa-search-p" placeholder="Tìm sản phẩm…" value="${esc(quickAddQuery)}" autocomplete="off">
        </div>
      </div>

      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Tìm sản phẩm nhanh</div>
        <div id="qa-list-p">${renderQuickAdd()}</div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger-ghost" data-action="cancel-po">${ICON.x} Hủy đơn</button>
      ${isNewUnsaved
        ? `<button class="btn btn-primary btn-block" data-action="close-modal">${ICON.check} Xong</button>`
        : `<button class="btn btn-primary btn-block" data-action="save-partner">${ICON.check} Lưu thay đổi</button>`
      }
    </div>
  `;
}

function renderPOLines(lines){
  return lines.map(l=>`
    <div class="line-row">
      <div class="line-top">
        <div class="line-name">${esc(l.productName)}</div>
        <div class="line-remove" data-action="po-remove-line" data-lineid="${l.id}">${ICON.trash}</div>
      </div>
      <div class="line-bottom">
        <div class="qty-stepper">
          <div class="qty-btn" data-action="po-qty" data-lineid="${l.id}" data-delta="-1">${ICON.minus}</div>
          <input class="qty-input" type="number" min="1" value="${l.qty}" data-field="po-qty-input" data-lineid="${l.id}">
          <div class="qty-btn" data-action="po-qty" data-lineid="${l.id}" data-delta="1">${ICON.plus}</div>
        </div>
        <div class="price-edit">
          <input class="price-input" type="number" value="${l.importPrice}" data-field="po-price" data-lineid="${l.id}">
        </div>
        <div class="line-total">${fmtVND(l.qty*l.importPrice)}</div>
      </div>
    </div>
  `).join('');
}

function renderQuickAdd(){
  const q = (quickAddQuery||'').toLowerCase();
  let products = quickAddProducts;
  if(q) products = products.filter(p=>p.name.toLowerCase().includes(q));
  if(!products.length) return `<div class="field-note">Không tìm thấy sản phẩm phù hợp.</div>`;
  const sorted = [...products].sort((a,b)=>{
    const ai = productHistoryIds.indexOf(a.id), bi = productHistoryIds.indexOf(b.id);
    return (bi>=0?1:0) - (ai>=0?1:0);
  });
  return sorted.map(p=>{
    const known = productHistoryIds.includes(p.id);
    return `<div class="quickadd-row" data-action="po-add-line" data-productid="${p.id}">
      <div class="quickadd-left"><span class="dot ${known?'dot-doitac':'dot-kho'}"></span>
        <div><div class="quickadd-name">${esc(p.name)}</div><div class="quickadd-price">${known?'Đã từng nhập từ đối tác này':'Chưa từng nhập từ đối tác này'}</div></div>
      </div>
      <div class="quickadd-add">${ICON.plus}</div>
    </div>`;
  }).join('');
}

function wireInputs(){
  const byId = id=>document.getElementById(id);
  const map = {
    'ptf-name': v=>partnerDraft.name = v,
    'ptf-s1-name': v=>partnerDraft.seller1.name = v,
    'ptf-s1-phone': v=>partnerDraft.seller1.phone = v,
    'ptf-s2-name': v=>partnerDraft.seller2.name = v,
    'ptf-s2-phone': v=>partnerDraft.seller2.phone = v,
    'ptf-address': v=>partnerDraft.address = v,
    'ptf-facebook': v=>partnerDraft.facebookId = v,
  };
  Object.keys(map).forEach(id=>{
    const el = byId(id);
    if(el) el.addEventListener('input', e=>map[id](e.target.value));
  });
  const qaEl = byId('qa-search-p');
  if(qaEl) qaEl.addEventListener('input', e=>{
    quickAddQuery = e.target.value;
    document.getElementById('qa-list-p').innerHTML = renderQuickAdd();
  });
  document.querySelectorAll('[data-field="po-qty-input"]').forEach(el=>{
    el.addEventListener('input', e=> poSetQty(el.dataset.lineid, e.target.value));
  });
  document.querySelectorAll('[data-field="po-price"]').forEach(el=>{
    el.addEventListener('input', e=> poSetPrice(el.dataset.lineid, e.target.value));
  });
}

function findProductCache(productId){ return quickAddProducts.find(p=>p.id===productId); }

async function poAddLine(productId){
  const existingLocal = isNewPartner ? localDraftLines.find(l=>l.productId===productId) : poLines.find(l=>l.product_id===productId);
  if(existingLocal){
    const currentId = isNewPartner ? existingLocal.localId : existingLocal.id;
    await poSetQty(currentId, existingLocal.qty+1);
    return;
  }
  const p = findProductCache(productId);
  if(!p) return;
  let importPrice = p.import_price || 0;
  if(!isNewPartner){
    const last = await getPartnerPrice(partnerId, productId).catch(()=>null);
    importPrice = last ? last.price : p.import_price;
  }

  if(isNewPartner){
    localDraftLines.push({ localId:'local-'+(++localLineSeq), productId, productName:p.name, qty:1, importPrice });
    paint();
    return;
  }
  try{
    const line = await addPOLine({ purchase_order_id: poRecord.id, product_id:productId, qty:1, import_price:importPrice });
    poLines.push(line);
    paint();
  } catch(err){
    showToast('Không thêm được sản phẩm vào đơn — kiểm tra lại kết nối mạng.', []);
  }
}

async function applyDemand(){
  const entries = Object.values(demandMap).filter(e=>e.qty>0);
  for(const e of entries){
    if(isNewPartner){
      const line = localDraftLines.find(l=>l.productId===e.productId);
      if(line) line.qty = e.qty;
      else {
        const p = findProductCache(e.productId);
        localDraftLines.push({ localId:'local-'+(++localLineSeq), productId:e.productId, productName:e.productName, qty:e.qty, importPrice:p?p.import_price:0 });
      }
    } else {
      const existing = poLines.find(l=>l.product_id===e.productId);
      try{
        if(existing){
          const idx = poLines.findIndex(l=>l.id===existing.id);
          poLines[idx] = await updatePOLine(existing.id, { qty:e.qty });
        } else {
          const last = await getPartnerPrice(partnerId, e.productId).catch(()=>null);
          const p = findProductCache(e.productId);
          const importPrice = last ? last.price : (p?p.import_price:0);
          const line = await addPOLine({ purchase_order_id: poRecord.id, product_id:e.productId, qty:e.qty, import_price:importPrice });
          poLines.push(line);
        }
      } catch(err){
        showToast('Không áp dụng được gợi ý — kiểm tra lại kết nối mạng.', []);
      }
    }
  }
  paint();
}

async function poRemoveLine(lineId){
  if(isNewPartner){
    localDraftLines = localDraftLines.filter(l=>l.localId!==lineId);
    paint();
    return;
  }
  try{
    await deletePOLine(lineId);
    poLines = poLines.filter(l=>l.id!==lineId);
    paint();
  } catch(err){
    showToast('Không xoá được dòng hàng — kiểm tra lại kết nối mạng.', []);
  }
}

async function poChangeQty(lineId, delta){
  const current = displayLines().find(l=>l.id===lineId);
  if(!current) return;
  await poSetQty(lineId, Math.max(1, current.qty + delta));
}
async function poSetQty(lineId, val){
  const qty = Math.max(1, parseInt(val)||1);
  if(isNewPartner){
    const line = localDraftLines.find(l=>l.localId===lineId);
    if(line) line.qty = qty;
    paint();
    return;
  }
  try{
    const idx = poLines.findIndex(l=>l.id===lineId);
    if(idx===-1) return;
    poLines[idx] = await updatePOLine(lineId, { qty });
    paint();
  } catch(err){
    showToast('Không cập nhật được số lượng — kiểm tra lại kết nối mạng.', []);
  }
}
async function poSetPrice(lineId, val){
  const importPrice = Math.max(0, parseFloat(val)||0);
  if(isNewPartner){
    const line = localDraftLines.find(l=>l.localId===lineId);
    if(line) line.importPrice = importPrice;
    return;
  }
  try{
    const idx = poLines.findIndex(l=>l.id===lineId);
    if(idx===-1) return;
    poLines[idx] = await updatePOLine(lineId, { import_price: importPrice });
  } catch(err){
    showToast('Không cập nhật được giá — kiểm tra lại kết nối mạng.', []);
  }
}

function savePartnerForm(){
  const d = partnerDraft;
  if(!d.name.trim()){
    d.errors = { name:true, any:true };
    paint();
    return;
  }
  d.errors = {};
  commitPartnerSave();
}

async function commitPartnerSave(){
  const d = partnerDraft;
  try{
    const before = await getPartner(partnerId);
    const beforeC1 = (before.partner_contacts||[]).find(c=>c.seq===1) || {name:'',phone:''};
    const beforeC2 = (before.partner_contacts||[]).find(c=>c.seq===2) || {name:'',phone:''};

    const updated = await updatePartner(partnerId, { name:d.name.trim(), address:d.address.trim(), facebook_id:d.facebookId.trim() });
    await Promise.all([
      upsertPartnerContact(partnerId, 1, { name:d.seller1.name.trim(), phone:d.seller1.phone.trim() }),
      upsertPartnerContact(partnerId, 2, { name:d.seller2.name.trim(), phone:d.seller2.phone.trim() }),
    ]);

    requestCloseTopModal();
    resetSearchAndRefresh();
    showToast(`Đã cập nhật "${updated.name}".`, [], { icon:ICON.check, undo: async ()=>{
      try{
        await updatePartner(partnerId, { name:before.name, address:before.address, facebook_id:before.facebook_id });
        await Promise.all([
          upsertPartnerContact(partnerId, 1, { name:beforeC1.name||'', phone:beforeC1.phone||'' }),
          upsertPartnerContact(partnerId, 2, { name:beforeC2.name||'', phone:beforeC2.phone||'' }),
        ]);
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

function confirmCancelPO(){
  const label = partnerDraft?.name || 'đối tác này';
  openConfirmModal('Hủy đơn hàng?', `Bạn có chắc muốn hủy đơn mua từ "${esc(label)}" không? Không thể hoàn tác thao tác này.`, async ()=>{
    if(isNewPartner){
      localDraftLines = [];
      requestCloseTopModal();
      return;
    }
    try{
      await cancelPurchaseOrder(poRecord.id);
      notifyPurchaseOrdersChanged();
      requestCloseTopModal();
    } catch(err){
      showToast('Không hủy được đơn hàng — kiểm tra lại kết nối mạng.', []);
    }
  });
}

export function handlePartnerModalAction(action, el){
  switch(action){
    case 'po-remove-line': poRemoveLine(el.dataset.lineid); return true;
    case 'po-qty': poChangeQty(el.dataset.lineid, parseInt(el.dataset.delta)); return true;
    case 'po-add-line': poAddLine(el.dataset.productid); return true;
    case 'apply-demand': applyDemand(); return true;
    case 'save-partner': savePartnerForm(); return true;
    case 'cancel-po': confirmCancelPO(); return true;
    case 'retry-partner-modal': openPartnerModal(partnerId); return true;
  }
  return false;
}
