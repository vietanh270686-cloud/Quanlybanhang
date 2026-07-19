import './style.css';
import { initAuth, renderLoginView, hideLoginView, signOut } from './auth.js';
import { renderHome, clearSearch } from './home.js';
import { requestCloseTopModal, takePendingConfirmAction } from './modal.js';
import { openProductModal, handleProductModalAction } from './products.js';
import { openCustomerModal, handleCustomerModalAction } from './customers.js';
import { openSalesScreen, handleSalesScreenAction } from './salesOrdersScreen.js';
import { openPartnerModal, handlePartnerModalAction } from './partners.js';
import { openPurchaseScreen, handlePurchaseScreenAction } from './purchaseOrdersScreen.js';
import { openDebtScreen, handleDebtScreenAction } from './debtScreen.js';
import { openProductMenu, handleProductMenuAction } from './productsMenu.js';
import { openCustomerMenu, handleCustomerMenuAction } from './customersMenu.js';
import { openPartnerMenu, handlePartnerMenuAction } from './partnersMenu.js';
import { openWarehouseScreen, handleWarehouseAction } from './warehouseScreen.js';
import { handleRestockModalAction } from './restockModal.js';

let appStarted = false;

initAuth(session=>{
  if(session){
    hideLoginView();
    if(!appStarted){
      appStarted = true;
      startAppEvents();
    }
    renderHome();
  } else {
    appStarted = false;
    renderLoginView();
  }
});

function startAppEvents(){
  document.addEventListener('click', async function(e){
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;

    if(handleProductModalAction(action, el)) return;
    if(handleCustomerModalAction(action, el)) return;
    if(handleSalesScreenAction(action, el)) return;
    if(handlePartnerModalAction(action, el)) return;
    if(handlePurchaseScreenAction(action, el)) return;
    if(handleDebtScreenAction(action, el)) return;
    if(handleProductMenuAction(action, el)) return;
    if(handleCustomerMenuAction(action, el)) return;
    if(handlePartnerMenuAction(action, el)) return;
    if(handleWarehouseAction(action, el)) return;
    if(handleRestockModalAction(action, el)) return;

    switch(action){
      case 'logout':
        await signOut();
        break;
      case 'clear-search':
        clearSearch();
        break;
      case 'retry-home':
        renderHome();
        break;
      case 'close-modal':
        requestCloseTopModal();
        break;
      case 'confirm-update': {
        const overlays = document.querySelectorAll('#modalRoot .overlay');
        const top = overlays[overlays.length-1];
        if(top) top.remove();
        const fn = takePendingConfirmAction();
        if(fn) fn();
        break;
      }
      case 'open-product':
        openProductModal(el.dataset.id || null);
        break;
      case 'create-from-search':
        openProductModal(null);
        break;
      case 'open-customer':
        openCustomerModal(el.dataset.id || null);
        break;
      case 'open-sales-screen':
        openSalesScreen();
        break;
      case 'open-partner':
        openPartnerModal(el.dataset.id || null);
        break;
      case 'open-purchase-screen':
        openPurchaseScreen();
        break;
      case 'open-debt-screen':
        openDebtScreen();
        break;
      case 'open-product-menu':
        openProductMenu();
        break;
      case 'open-customer-menu':
        openCustomerMenu();
        break;
      case 'open-partner-menu':
        openPartnerMenu();
        break;
      case 'open-warehouse':
        openWarehouseScreen();
        break;
    }
  });
}
