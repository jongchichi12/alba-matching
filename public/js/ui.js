// 화면 도우미: 안전한 템플릿(h), 포맷터, 토스트, 이벤트 위임
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

// h`...` : 끼워 넣는 값은 자동으로 이스케이프. h 로 만든 조각이나 raw() 는 그대로 통과.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(s);
const val = v => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : v == null || v === false ? '' : esc(v));
export const h = (strs, ...vals) => new Raw(strs.reduce((a, s, i) => a + s + (i < vals.length ? val(vals[i]) : ''), ''));

// ---------- 포맷 ----------
const pad = n => String(n).padStart(2, '0');
export const won = n => `${Number(n).toLocaleString('ko-KR')}원`;
export function dt(v) {
  if (!v) return '-';
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function day(v) {
  if (!v) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const mins = m => (m == null ? '-' : `${Math.floor(m / 60)}시간 ${m % 60}분`);
export const todayStr = () => day(new Date());
// datetime-local 입력용 (지금 + offset분)
export function localInput(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const toIso = local => new Date(local).toISOString();
export const stars = n => (n == null ? '-' : '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) + ` ${n}`);

const LABEL = {
  open: '모집중', closed: '마감',
  pending: '대기', accepted: '확정', completed: '완료', rejected: '거절',
  scheduled: '예정', checked_in: '출근', checked_out: '퇴근', confirmed: '확인됨', no_show: '결근',
  issued: '발행', paid: '지급완료', disputed: '이의제기'
};
export const badge = s => h`<span class="badge s-${s}">${LABEL[s] || s}</span>`;

// ---------- 폼 도우미 ----------
export const options = (list, sel) => raw(list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`).join(''));
export const fields = form => Object.fromEntries(new FormData(form).entries());

// ---------- 토스트 ----------
let toastBox;
export function toast(msg, kind = 'ok') {
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.id = 'toasts'; document.body.appendChild(toastBox); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  toastBox.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2500);
}

// ---------- 이벤트 위임 ----------
// <button data-act="이름" data-id="3"> / <form data-form="이름"> 을 actions[이름] 으로 연결
export const actions = {};
let onError = e => toast(e.message, 'err');
export const setErrorHandler = fn => { onError = fn; };

async function run(fn, el, ...args) {
  if (!fn) return;
  const btn = el.matches('button') ? el : el.querySelector('button[type=submit], button:not([type])');
  if (btn) btn.disabled = true;
  try { await fn(el, ...args); } catch (e) { onError(e); } finally { if (btn) btn.disabled = false; }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const name = el.dataset.act;
  if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
  e.preventDefault();
  run(actions[name], el, e);
});
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  run(actions[form.dataset.form], form, fields(form));
});
