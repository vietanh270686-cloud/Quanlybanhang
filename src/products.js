import { ICON } from './icons.js';
import { esc, fmtVND, timeAgo, debounce } from './utils.js';
import { openModal, rerenderTopModal, requestCloseTopModal, openConfirmModal, loadingSkeleton, errorBanner } from './modal.js';
import { showToast } from './toast.js';
import { searchQuery, resetSearchAndRefresh } from './home.js';
import {
  getProduct, createProduct, updateProduct, deleteProduct,
  getPartnerHistoryForProduct, setPartnerPrice, deletePartnerPrice,
  searchPartnersByName,
} from './api/products.js';

let productDraft = null;
let productPartnerQuery = '';
let productHistCache = [];      // lịch sử đối tác đã từng bán sản phẩm này (khi sửa sản phẩm cũ)
let productCandidates = [];      // danh sách hiển thị ở "Tìm đối tác cung cấp"
let productCandidatesLoading = false;
let productLoadError = null;

export async function openProductModal(productId){
  productLoadError = null;
  productDraft = null;
  openModal(loadingModalHtml(productId ? 'Sản phẩm' : 'Sản phẩm mới'), {});

  try{
    let existing = null;
    productHistCache = [];
    if(productId){
      const [prod, hist] = await Promise.all([getProduct(productId), getPartnerHistoryForProduct(productId)]);
      existing = prod;
      productHistCache = hist;
    }
    const defaultSource = productHistCache.length
      ? { type:'partner', partnerId:productHistCache[0].partnerId, price:productHistCache[0].price }
      : { type:'kho', price: existing ? existing.import_price : 0 };
    productDraft = {
      id: productId || null,
      name: existing ? existing.name : (searchQuery || ''),
      sellPriceRetail: existing ? existing.sell_price_retail : 0,
      sellPriceWholesale: existing ? existing.sell_price_wholesale : 0,
      source: defaultSource,
      restockQty: 0,
      errors: {},
      existingImportPrice: existing ? existing.import_price : 0,
      existingStockQty: existing ? (existing.stock_qty||0) : 0,
      existingSnapshot: existing ? {
        name: existing.name,
        sell_price_retail: existing.sell_price_retail,
        sell_price_wholesale: existing.sell_price_wholesale,
        import_price: existing.import_price,
      } : null,
    };
    productPartnerQuery = '';
    productCandidates = productHistCache.length
      ? productHistCache.map(h=>({ partnerId:h.partnerId, name:h.partnerName, price:h.price, date:h.date, known:true }))
      : [];
    if(!productCandidates.length){
      await loadFallbackCandidates('');
    }
  } catch(err){
    productLoadError = err;
  }
  paintProductModal();
}

async function loadFallbackCandidates(query){
  productCandidatesLoading = true;
  paintProductModal();
  try{
    const partners = await searchPartnersByName(query);
    const knownIds = new Set(productHistCache.map(h=>h.partnerId));
    productCandidates = partners
      .filter(p=>!knownIds.has(p.id))
      .map(p=>({ partnerId:p.id, name:p.name, price:null, date:null, known:false }));
    if(!query){
      // "Trong kho" + đối tác đã biết luôn đứng trước, sau đó tới đối tác chưa từng nhập
      productCandidates = [
        ...productHistCache.map(h=>({ partnerId:h.partnerId, name:h.partnerName, price:h.price, date:h.date, known:true })),
        ...productCandidates,
      ];
    }
  } catch(err){
    productLoadError = err;
  }
  productCandidatesLoading = false;
}

function sourceLabel(source){
  if(source.type==='kho') return 'Trong kho';
  const known = productCandidates.find(c=>c.partnerId===source.partnerId) || productHistCache.find(h=>h.partnerId===source.partnerId);
  return known ? (known.name||known.partnerName) : '';
}

function loadingModalHtml(title){
  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div class="modal-title">${esc(title)}</div>
      <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
    </div>
    <div class="modal-body">
      <div class="card">${loadingSkeleton(4)}</div>
    </div>
  `;
}

function paintProductModal(){
  rerenderTopModal(productModalHtml());
  wireProductModalInputs();
}

function productModalHtml(){
  if(productLoadError){
    return `
      <div class="modal-handle"></div>
      <div class="modal-head">
        <div class="modal-title">Sản phẩm</div>
        <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
      </div>
      <div class="modal-body">${errorBanner('Không tải được dữ liệu sản phẩm — kiểm tra lại kết nối mạng.', { retryAction:'retry-product-modal' })}</div>
    `;
  }
  if(!productDraft) return loadingModalHtml('Sản phẩm');

  const isNew = !productDraft.id;
  const errors = productDraft.errors || {};
  const candidates = productCandidates;
  return `
    <div class="modal-handle"></div>
    <div class="modal-head">
      <div class="modal-title">${isNew?'Sản phẩm mới':'Sản phẩm'}</div>
      <div class="icon-btn" data-action="close-modal">${ICON.close}</div>
    </div>
    <div class="modal-body">
      ${errors.any ? `<div class="form-warning">${ICON.warn} Vui lòng nhập đủ thông tin sản phẩm trước khi lưu — các ô còn thiếu đã được đánh dấu đỏ bên dưới.</div>` : ''}
      <div class="card">
        <div class="field">
          <div class="field-label">Tên sản phẩm</div>
          <input class="input ${errors.name?'error':''}" id="pf-name" value="${esc(productDraft.name)}" placeholder="VD: Ốp lưng iPhone 16">
          ${errors.name?`<div class="field-error">${ICON.warn} Chưa nhập tên sản phẩm</div>`:''}
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Giá nhập (${esc(sourceLabel(productDraft.source))})</div>
            <input class="input" type="number" id="pf-import" value="${productDraft.source.price||''}" placeholder="0">
          </div>
          ${productDraft.source.type==='partner' ? `
          <div class="field">
            <div class="field-label">SL nhập từ đối tác này</div>
            <div class="qty-stepper">
              <div class="qty-btn" data-action="restock-qty" data-delta="-1">${ICON.minus}</div>
              <input class="qty-input" type="number" min="0" id="pf-restock-qty" value="${productDraft.restockQty}">
              <div class="qty-btn" data-action="restock-qty" data-delta="1">${ICON.plus}</div>
            </div>
          </div>
          ` : ''}
        </div>
        ${productDraft.source.type==='partner' ? `<div class="field-note" style="margin-top:-6px; margin-bottom:12px;">Tồn kho hiện tại: ${productDraft.existingStockQty}${productDraft.restockQty>0?` · Sẽ nhập thêm ${productDraft.restockQty} -> tồn kho mới ${productDraft.existingStockQty+productDraft.restockQty}`:''}</div>` : ''}
        <div class="field-row">
          <div class="field">
            <div class="field-label">Giá bán lẻ</div>
            <input class="input" type="number" id="pf-sell-retail" value="${productDraft.sellPriceRetail||''}" placeholder="0">
          </div>
          <div class="field">
            <div class="field-label">Giá bán sỉ</div>
            <input class="input" type="number" id="pf-sell-wholesale" value="${productDraft.sellPriceWholesale||''}" placeholder="0">
          </div>
        </div>
        <div class="field">
          <div class="field-label">Đối tác</div>
          <div class="readonly-field">${esc(sourceLabel(productDraft.source))}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div class="search-box">
          ${ICON.search}
          <input id="pf-partner-search" placeholder="Gõ tên đối tác…" value="${esc(productPartnerQuery)}" autocomplete="off">
        </div>
      </div>

      <div class="card">
        <div class="field-label" style="margin-bottom:9px;">Tìm đối tác cung cấp</div>
        <div class="source-row ${productDraft.source.type==='kho'?'selected':''}" data-action="select-source" data-type="kho">
          <div class="source-left"><span class="dot dot-kho"></span><span class="source-name">Trong kho</span></div>
          <div class="source-price">${productDraft.id ? fmtVND(productDraft.existingImportPrice) : ''}</div>
        </div>
        ${productCandidatesLoading ? loadingSkeleton(2) : candidates.map(h=>`
          <div class="source-row ${productDraft.source.type==='partner'&&productDraft.source.partnerId===h.partnerId?'selected':''}" data-action="select-source" data-type="partner" data-partner="${h.partnerId}" data-price="${h.price||0}" data-name="${esc(h.name)}">
            <div class="source-left">
              <span class="dot dot-doitac"></span>
              <div>
                <div class="source-name">${esc(h.name)}</div>
                <div class="source-time">${h.known ? timeAgo(h.date) : 'Chưa từng nhập'}</div>
              </div>
            </div>
            <div class="source-price">${h.known ? fmtVND(h.price) : ''}</div>
          </div>
        `).join('')}
        ${!productCandidatesLoading && !candidates.length ? `<div class="field-note">Không tìm thấy đối tác phù hợp.</div>` : ''}
      </div>
    </div>
    <div class="modal-foot">
      ${isNew
        ? `<button class="btn btn-ghost" data-action="close-modal">Đóng</button>`
        : `<button class="btn btn-danger-ghost" data-action="delete-product">${ICON.trash} Xóa</button>`
      }
      <button class="btn btn-primary btn-block" data-action="save-product">${ICON.check} ${isNew?'Tạo mới':'Cập nhật'}</button>
    </div>
  `;
}

function wireProductModalInputs(){
  const byId = id=>document.getElementById(id);
  const nameEl = byId('pf-name');
  if(nameEl) nameEl.addEventListener('input', e=>{ productDraft.name = e.target.value; });
  const importEl = byId('pf-import');
  if(importEl) importEl.addEventListener('input', e=>{ productDraft.source.price = parseFloat(e.target.value)||0; });
  const retailEl = byId('pf-sell-retail');
  if(retailEl) retailEl.addEventListener('input', e=>{ productDraft.sellPriceRetail = parseFloat(e.target.value)||0; });
  const wholesaleEl = byId('pf-sell-wholesale');
  if(wholesaleEl) wholesaleEl.addEventListener('input', e=>{ productDraft.sellPriceWholesale = parseFloat(e.target.value)||0; });
  const restockEl = byId('pf-restock-qty');
  if(restockEl) restockEl.addEventListener('input', e=>{
    productDraft.restockQty = Math.max(0, parseInt(e.target.value)||0);
    rerenderTopModal(productModalHtml());
    wireProductModalInputs();
  });
  const partnerSearchEl = byId('pf-partner-search');
  if(partnerSearchEl){
    partnerSearchEl.addEventListener('input', e=>{
      productPartnerQuery = e.target.value;
      schedulePartnerSearch();
    });
  }
}

const schedulePartnerSearch = debounce(async ()=>{
  const myQuery = productPartnerQuery;
  await loadFallbackCandidates(myQuery);
  if(myQuery !== productPartnerQuery) return;
  rerenderTopModal(productModalHtml());
  wireProductModalInputs();
  const fresh = document.getElementById('pf-partner-search');
  if(fresh){ fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
}, 1000);

export function handleProductModalAction(action, el){
  switch(action){
    case 'select-source':
      productDraft.restockQty = 0;
      if(el.dataset.type==='kho'){
        productDraft.source = { type:'kho', price: productDraft.id ? productDraft.existingImportPrice : 0 };
      } else {
        productDraft.source = { type:'partner', partnerId: el.dataset.partner, price: parseFloat(el.dataset.price) };
      }
      paintProductModal();
      return true;
    case 'restock-qty':
      productDraft.restockQty = Math.max(0, productDraft.restockQty + parseInt(el.dataset.delta));
      paintProductModal();
      return true;
    case 'save-product':
      saveProductDraft();
      return true;
    case 'delete-product':
      confirmDeleteProduct();
      return true;
    case 'retry-product-modal':
      openProductModal(productDraft?.id || null);
      return true;
  }
  return false;
}

function confirmDeleteProduct(){
  const name = productDraft.name || 'sản phẩm này';
  if(productDraft.existingStockQty > 0){
    showToast(`Không thể xóa "${name}" — còn ${productDraft.existingStockQty} tồn kho. Cập nhật tồn kho về 0 ở màn Kho hàng trước khi xóa.`, []);
    return;
  }
  openConfirmModal('Xóa sản phẩm?', `Xóa "${esc(name)}"? Không thể hoàn tác.`, ()=>commitDeleteProduct());
}

async function commitDeleteProduct(){
  try{
    await deleteProduct(productDraft.id);
    requestCloseTopModal();
    resetSearchAndRefresh();
    showToast(`Đã xóa sản phẩm "${productDraft.name}".`, []);
  } catch(err){
    if(err && err.code === '23503'){
      showToast(`Không xóa được "${productDraft.name}" — sản phẩm đã có trong lịch sử đơn hàng/nhập hàng nên phải giữ lại. Có thể đặt giá bán về 0 nếu không muốn bán nữa.`, []);
    } else {
      showToast('Không xóa được sản phẩm — kiểm tra lại kết nối mạng.', []);
    }
  }
}

function saveProductDraft(){
  const name = (productDraft.name||'').trim();
  if(!name){
    productDraft.errors = { name:true, any:true };
    paintProductModal();
    return;
  }
  productDraft.errors = {};
  commitProductSave();
}

async function commitProductSave(){
  const name = (productDraft.name||'').trim();
  const isEdit = !!productDraft.id;
  const fields = {
    name,
    sell_price_retail: productDraft.sellPriceRetail || 0,
    sell_price_wholesale: productDraft.sellPriceWholesale || 0,
  };

  let beforePartnerPrice = null;
  try{
    let product;
    if(isEdit){
      if(productDraft.source.type==='partner'){
        beforePartnerPrice = productHistCache.find(h=>h.partnerId===productDraft.source.partnerId) || null;
      }
      product = await updateProduct(productDraft.id, fields);
    } else {
      product = await createProduct({ ...fields, import_price: 0 });
    }

    if(productDraft.source.type==='kho'){
      product = await updateProduct(product.id, { import_price: productDraft.source.price });
    } else {
      await setPartnerPrice(productDraft.source.partnerId, product.id, productDraft.source.price);
      if(!product.import_price){
        product = await updateProduct(product.id, { import_price: productDraft.source.price });
      }
    }

    const restockQty = productDraft.restockQty || 0;
    const beforeStockQty = productDraft.existingStockQty || 0;
    if(productDraft.source.type==='partner' && restockQty > 0){
      product = await updateProduct(product.id, { stock_qty: beforeStockQty + restockQty });
    }

    requestCloseTopModal();
    resetSearchAndRefresh();

    const restockNote = restockQty>0 ? ` Đã nhập thêm ${restockQty} vào kho — tồn kho mới: ${beforeStockQty+restockQty}.` : '';
    if(isEdit){
      const beforeFull = productDraft.existingSnapshot;
      showToast(`Đã cập nhật "${name}".${restockNote}`, [], { icon:ICON.check, undo: async ()=>{
        try{
          await updateProduct(product.id, {
            name: beforeFull.name, sell_price_retail: beforeFull.sell_price_retail,
            sell_price_wholesale: beforeFull.sell_price_wholesale, import_price: beforeFull.import_price,
            stock_qty: beforeStockQty,
          });
          if(productDraft.source.type==='partner'){
            if(beforePartnerPrice) await setPartnerPrice(beforePartnerPrice.partnerId, product.id, beforePartnerPrice.price);
            else await deletePartnerPrice(productDraft.source.partnerId, product.id);
          }
          resetSearchAndRefresh();
          showToast(`Đã hoàn tác thay đổi cho "${beforeFull.name}".`, []);
        } catch(err){
          showToast('Không hoàn tác được — kiểm tra lại kết nối mạng.', []);
        }
      }});
    } else {
      showToast(`Đã tạo sản phẩm "${name}".${restockNote}`, [], { icon:ICON.check });
    }
  } catch(err){
    showToast('Không lưu được sản phẩm — kiểm tra lại kết nối mạng và thử lại.', []);
  }
}
