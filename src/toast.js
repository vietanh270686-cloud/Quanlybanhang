import { ICON } from './icons.js';
import { esc } from './utils.js';

export function showToast(title, lines, opts){
  opts = opts || {};
  const root = document.getElementById('toastRoot');
  const t = document.createElement('div');
  t.className = 'toast';
  const icon = opts.icon || ICON.warn;
  t.innerHTML = `<div>${icon}</div>
    <div class="toast-msg"><b>${esc(title)}</b>${lines&&lines.length?`<ul>${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''}</div>
    <div class="toast-actions">
      ${opts.undo?`<button type="button" class="toast-undo-btn">Hoàn tác</button>`:''}
      <div class="toast-close">${ICON.close}</div>
    </div>`;
  root.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  t.querySelector('.toast-close').addEventListener('click', ()=> dismissToast(t));
  if(opts.undo){
    t.querySelector('.toast-undo-btn').addEventListener('click', ()=>{ dismissToast(t); opts.undo(); });
  }
  setTimeout(()=> dismissToast(t), opts.undo ? 6000 : 7000);
}
export function dismissToast(t){ t.classList.remove('show'); setTimeout(()=>t.remove(), 200); }
