import { ICON } from './icons.js';
import { esc, fmtVND, debounce } from './utils.js';
import { openModal, rerenderTopModal, closeTopModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import { getProduct, updateProduct, getPartnerPrice, setPartnerPrice, searchPartnersByName } from './api/products.js';

let wrap = null;
let draft = null; // {productId, orderQty, product, stockQty, originalStockQty, partnerId, partnerName, partnerQuery, partnerResults, partnerQty, partnerQtyTouched, priceOverride, onSaved}
let loadError = null;
let lastArgs = null;

export async function openRestockModal(productId, orderQty, onSaved){
  lastArgs = { productId, orderQty, onSaved };
  loadError = null;
  draft = null;
  wrap = openModal(loadingHtml());
  try{
    const [product, partnerResults] = await Promise.all([ getProduct(productId), searchPartnersByName('') ]);
    const stockQty = product.stock_qty||0;
    draft = {
      productId, orderQty, product,
      stockQty, originalStockQty: stockQty,
      partnerId:null, partnerName:'', partnerQuery:'', partnerResults,
      partnerQty: Math.max(1, orderQty-stockQty),
      partnerQtyTouched:false, priceOverride:null, suggestedPrice: product.import_price||0,
      onSaved,
    };
  } catch(err){
    loadError = err;
  }
  repaint();
}

function loadingHtml(){
  return `
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Nhập hàng</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body"><div class="card">${loadingSkeleton(4)}</div></div>
  `;
}
function suggestedPartnerQty(){
  return Math.max(1, draft.orderQty - draft.stockQty);
}
function canSave(){
  return !!draft.partnerId || draft.stockQty !== draft.originalStockQty;
}
function currentPrice(){
  return draft.priceOverride!=null ? draft.priceOverride : draft.suggestedPrice;
}

function bodyHtml(){
  if(loadError){
    return `
      <div class="modal-handle"></div>
      <div class="modal-head"><div class="modal-title">Nhập hàng</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
      <div class="modal-body">${errorBanner('Không tải được dữ liệu — kiểm tra lại kết nối mạng.', { retryAction:'restock-retry' })}</div>
    `;
  }
  if(!draft) return loadingHtml();

  const p = draft.product;
  const total = draft.partnerQty * currentPrice();
  const matches = draft.partnerQuery
    ? draft.partnerResults.filter(pt=>pt.name.toLowerCase().includes(draft.partnerQuery.toLowerCase()))
    : draft.partnerResults;

  return `
    <div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Nhập hàng</div><div class="icon-btn" data-action="close-modal">${ICON.close}</div></div>
    <div class="modal-body">
      <div class="card">
        <div class="field"><div class="field-label">Mặt hàng</div><div class="readonly-field">${esc(p.name)}</div></div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Số lượng trong kho</div>
            <div class="qty-stepper" style="width:fit-content;">
              <div class="qty-btn" data-action="restock-stock-qty" data-delta="-1">${ICON.minus}</div>
              <input class="qty-input" style="width:52px;" type="number" min="0" id="rs-stock-qty" value="${draft.stockQty}">
              <div class="qty-btn" data-action="restock-stock-qty" data-delta="1">${ICON.plus}</div>
            </div>
            <div class="field-note">Sửa trực tiếp nếu tồn kho thực tế khác số này.</div>
          </div>
          <div class="field">
            <div class="field-label">Số lượng hàng trong đơn</div>
            <div class="readonly-field">${draft.orderQty}</div>
          </div>
        </div>
      </div>

      ${!draft.partnerId ? `
      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">${ICON.search}<input id="rs-partner-search" placeholder="Gõ tên đối tác…" value="${esc(draft.partnerQuery)}"></div>
      </div>
      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Nhập từ đối tác</div>
        <div id="rs-partner-list">${matches.length ? matches.map(pt=>`
          <div class="quickadd-row" data-action="restock-pick-partner" data-partnerid="${pt.id}" data-partnername="${esc(pt.name)}">
            <div class="quickadd-left"><span class="dot dot-doitac"></span><div class="quickadd-name">${esc(pt.name)}</div></div>
            ${ICON.chevRight}
          </div>`).join('') : `<div class="field-note">Không tìm thấy đối tác phù hợp.</div>`}</div>
      </div>
      ` : `
      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Nhập từ đối tác</div>
        <div style="display:flex; align-items:center; justify-content:space-between; padding:11px 12px; border:1.5px solid var(--primary); background:#F1F5FA; border-radius:12px; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:8px;"><span class="dot dot-doitac"></span><b style="font-size:13.5px;">${esc(draft.partnerName)}</b></div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="restock-clear-partner">Đổi</button>
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Số lượng nhập hàng</div>
            <div class="qty-stepper" style="width:fit-content;">
              <div class="qty-btn" data-action="restock-partner-qty" data-delta="-1">${ICON.minus}</div>
              <input class="qty-input" style="width:52px;" type="number" min="1" id="rs-partner-qty" value="${draft.partnerQty}">
              <div class="qty-btn" data-action="restock-partner-qty" data-delta="1">${ICON.plus}</div>
            </div>
            <div class="field-note">Gợi ý = số trong đơn (${draft.orderQty}) − số trong kho (${draft.stockQty}).</div>
          </div>
          <div class="field">
            <div class="field-label">Giá nhập</div>
            <input class="input" type="number" id="rs-price" value="${currentPrice()}">
            <div class="field-note">Gợi ý ${fmtVND(draft.suggestedPrice)} — sửa được nếu giá lần này khác.</div>
          </div>
        </div>
      </div>
      `}
    </div>
    <div class="modal-foot">
      ${draft.partnerId ? `
      <div style="flex:1;">
        <div style="font-size:11px; color:var(--ink-faint); font-weight:700; text-transform:uppercase;">Tổng tiền nhập</div>
        <div style="font-size:17px; font-weight:800; font-family:'Sora';" id="rs-total-value">${fmtVND(total)}</div>
      </div>
      ` : `<div style="flex:1; font-size:12px; color:var(--ink-faint); line-height:1.5;">Chưa chọn đối tác — vẫn lưu được nếu chỉ sửa trực tiếp "Số lượng trong kho".</div>`}
      <button class="btn btn-primary" data-action="restock-save" ${canSave()?'':'disabled'}>${ICON.check} Lưu</button>
    </div>
  `;
}
function repaint(){
  rerenderTopModal(bodyHtml());
  wireInputs();
}
const schedulePartnerSearch = debounce(async ()=>{
  if(!draft) return;
  draft.partnerResults = await searchPartnersByName(draft.partnerQuery).catch(()=>draft.partnerResults);
  repaint();
  const fresh = wrap?.querySelector('#rs-partner-search');
  if(fresh){ fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
}, 1000);
function wireInputs(){
  if(!wrap?.isConnected || !draft) return;
  const stockQtyEl = wrap.querySelector('#rs-stock-qty');
  if(stockQtyEl) stockQtyEl.addEventListener('input', e=>{
    draft.stockQty = Math.max(0, parseInt(e.target.value)||0);
    if(!draft.partnerQtyTouched) draft.partnerQty = suggestedPartnerQty();
    repaint();
  });
  const pSearch = wrap.querySelector('#rs-partner-search');
  if(pSearch) pSearch.addEventListener('input', e=>{
    draft.partnerQuery = e.target.value;
    schedulePartnerSearch();
  });
  const pQtyEl = wrap.querySelector('#rs-partner-qty');
  if(pQtyEl) pQtyEl.addEventListener('input', e=>{
    draft.partnerQty = Math.max(1, parseInt(e.target.value)||1);
    draft.partnerQtyTouched = true;
    repaint();
  });
  const priceEl = wrap.querySelector('#rs-price');
  if(priceEl) priceEl.addEventListener('input', e=>{
    draft.priceOverride = Math.max(0, parseFloat(e.target.value)||0);
    const totalEl = wrap.querySelector('#rs-total-value');
    if(totalEl) totalEl.textContent = fmtVND(draft.partnerQty * draft.priceOverride);
  });
}

async function pickPartner(partnerId, partnerName){
  draft.partnerId = partnerId;
  draft.partnerName = partnerName;
  draft.priceOverride = null;
  try{
    const pp = await getPartnerPrice(partnerId, draft.productId);
    draft.suggestedPrice = pp ? pp.price : (draft.product.import_price||0);
  } catch(err){
    draft.suggestedPrice = draft.product.import_price||0;
  }
  if(!draft.partnerQtyTouched) draft.partnerQty = suggestedPartnerQty();
  repaint();
}

async function save(){
  if(!draft || !canSave()) return;
  try{
    if(!draft.partnerId){
      await updateProduct(draft.productId, { stock_qty: draft.stockQty });
      closeTopModal();
      showToast(`Đã cập nhật tồn kho "${draft.product.name}" thành ${draft.stockQty}.`, []);
      if(draft.onSaved) draft.onSaved({ productId:draft.productId, stockQty:draft.stockQty });
    } else {
      const price = currentPrice();
      const newStockQty = draft.stockQty + draft.partnerQty;
      await updateProduct(draft.productId, { stock_qty: newStockQty, import_price: price });
      await setPartnerPrice(draft.partnerId, draft.productId, price);
      closeTopModal();
      showToast(`Đã nhập ${draft.partnerQty} "${draft.product.name}" từ ${draft.partnerName} — tồn kho mới: ${newStockQty}.`, []);
      if(draft.onSaved) draft.onSaved({ productId:draft.productId, stockQty:newStockQty, importPrice:price });
    }
  } catch(err){
    showToast('Không lưu được — kiểm tra lại kết nối mạng.', []);
  }
}

export function handleRestockModalAction(action, el){
  switch(action){
    case 'restock-stock-qty':
      draft.stockQty = Math.max(0, draft.stockQty+parseInt(el.dataset.delta));
      if(!draft.partnerQtyTouched) draft.partnerQty = suggestedPartnerQty();
      repaint();
      return true;
    case 'restock-partner-qty':
      draft.partnerQty = Math.max(1, draft.partnerQty+parseInt(el.dataset.delta));
      draft.partnerQtyTouched = true;
      repaint();
      return true;
    case 'restock-pick-partner': pickPartner(el.dataset.partnerid, el.dataset.partnername); return true;
    case 'restock-clear-partner': draft.partnerId=null; draft.partnerName=''; repaint(); return true;
    case 'restock-save': save(); return true;
    case 'restock-retry':
      if(lastArgs) openRestockModal(lastArgs.productId, lastArgs.orderQty, lastArgs.onSaved);
      return true;
  }
  return false;
}
