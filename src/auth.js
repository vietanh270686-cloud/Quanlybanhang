import { supabase } from './supabaseClient.js';
import { ICON } from './icons.js';
import { esc } from './utils.js';
import { showToast } from './toast.js';

let loginError = '';
let loginBusy = false;

export function renderLoginView(){
  const el = document.getElementById('loginView');
  el.style.display = 'block';
  document.getElementById('homeView').style.display = 'none';
  el.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand display">Sổ Bán Hàng</div>
        <div class="login-sub">Đăng nhập để tiếp tục</div>
        ${loginError ? `<div class="form-warning">${ICON.warn} ${esc(loginError)}</div>` : ''}
        <form id="loginForm">
          <div class="field">
            <div class="field-label">Email</div>
            <input class="input" type="email" id="login-email" autocomplete="username" required>
          </div>
          <div class="field">
            <div class="field-label">Mật khẩu</div>
            <input class="input" type="password" id="login-password" autocomplete="current-password" required>
          </div>
          <button class="btn btn-primary btn-block" type="submit" ${loginBusy?'disabled':''}>
            ${loginBusy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  `;
  document.getElementById('loginForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    loginBusy = true; loginError = '';
    renderLoginView();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    loginBusy = false;
    if(error){
      loginError = error.message === 'Invalid login credentials'
        ? 'Sai email hoặc mật khẩu.'
        : 'Không đăng nhập được — kiểm tra lại kết nối mạng.';
      renderLoginView();
    }
    // đăng nhập thành công -> onAuthStateChange sẽ tự chuyển màn hình
  });
}

export function hideLoginView(){
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('homeView').style.display = 'block';
}

export async function signOut(){
  await supabase.auth.signOut();
}

export function initAuth(onChange){
  supabase.auth.getSession().then(({ data })=>{
    onChange(data.session);
  });
  supabase.auth.onAuthStateChange((event, session)=>{
    if(event === 'SIGNED_OUT'){
      showToast('Đã đăng xuất.', []);
    }
    onChange(session);
  });
}
