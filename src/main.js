import './style.css';
import { initAuth, renderLoginView, hideLoginView, signOut } from './auth.js';
import { renderMainScreen, handleMainScreenAction } from './mainScreen.js';
import { requestCloseTopModal, takePendingConfirmAction } from './modal.js';
import { handleProductModalAction } from './products.js';
import { handleCustomerModalAction } from './customers.js';
import { openSalesScreen, handleSalesScreenAction } from './salesOrdersScreen.js';
import { handlePartnerModalAction } from './partners.js';
import { openPurchaseScreen, handlePurchaseScreenAction } from './purchaseOrdersScreen.js';
import { openDebtScreen, handleDebtScreenAction } from './debtScreen.js';
import { openWarehouseScreen, handleWarehouseAction } from './warehouseScreen.js';
import { handleRestockModalAction } from './restockModal.js';
import { openReportsScreen, handleReportsScreenAction } from './reportsScreen.js';

let appStarted = false;

initAuth(session=>{
  if(session){
    hideLoginView();
    // onAuthStateChange bắn lại sự kiện (vd TOKEN_REFRESHED) mỗi khi quay lại app sau khi
    // chuyển sang app khác trên điện thoại — CHỈ render lại màn chính ở lần đăng nhập đầu
    // tiên, nếu không mainScreen.js sẽ bị vẽ lại từ đầu (mất tab/khách hàng đang xử lý dở,
    // kẹt ở "Đang tải" vì không có gì gọi lại việc tải dữ liệu thật).
    if(!appStarted){
      appStarted = true;
      startAppEvents();
      renderMainScreen();
    }
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
    if(handleWarehouseAction(action, el)) return;
    if(handleRestockModalAction(action, el)) return;
    if(handleReportsScreenAction(action, el)) return;
    if(handleMainScreenAction(action, el)) return;

    switch(action){
      case 'logout':
        await signOut();
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
      case 'open-sales-screen':
        openSalesScreen();
        break;
      case 'open-purchase-screen':
        openPurchaseScreen();
        break;
      case 'open-debt-screen':
        openDebtScreen();
        break;
      case 'open-warehouse':
        openWarehouseScreen();
        break;
      case 'open-reports-screen':
        openReportsScreen();
        break;
    }
  });
}
