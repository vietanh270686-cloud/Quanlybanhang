import './style.css';
import { initAuth, renderLoginView, hideLoginView, signOut } from './auth.js';
import { renderHome, clearSearch } from './home.js';
import { requestCloseTopModal, takePendingConfirmAction } from './modal.js';
import { openProductModal, handleProductModalAction } from './products.js';

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
    }
  });
}
