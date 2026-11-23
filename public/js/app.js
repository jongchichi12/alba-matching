// 해시 라우터 + 헤더. 화면은 views/*.js, 서버 호출은 api.js
import { get, ApiError } from './api.js';
import { h, esc, setErrorHandler, toast, actions } from './ui.js';
import { state, go } from './state.js';
import * as misc from './views/misc.js';
import * as jobs from './views/jobs.js';
import * as apps from './views/applications.js';
import * as resumes from './views/resumes.js';
import * as shifts from './views/shifts.js';
import * as money from './views/money.js';

// [패턴, 화면, 로그인 필요]  ※ 구체적인 경로를 위에 둔다
const ROUTES = [
  [/^\/login$/, misc.login, false],
  [/^\/join$/, misc.join, false],
  [/^\/jobs$/, jobs.jobsList, false],
  [/^\/jobs\/new$/, jobs.jobNew, true],
  [/^\/jobs\/(\d+)$/, jobs.jobDetail, false],
  [/^\/jobs\/(\d+)\/edit$/, jobs.jobEdit, true],
  [/^\/my-jobs$/, jobs.myJobs, true],
  [/^\/applicants$/, apps.applicants, true],
  [/^\/applications$/, apps.myApplications, true],
  [/^\/resumes$/, resumes.resumesList, true],
  [/^\/resumes\/new$/, resumes.resumeNew, true],
  [/^\/resumes\/(\d+)$/, resumes.resumeDetail, true],
  [/^\/resumes\/(\d+)\/edit$/, resumes.resumeEdit, true],
  [/^\/shifts$/, shifts.myShifts, true],
  [/^\/shifts\/manage$/, shifts.manageShifts, true],
  [/^\/payrolls$/, money.payrolls, true],
  [/^\/payrolls\/(\d+)$/, money.payrollDetail, true],
  [/^\/owners\/(\d+)$/, money.owner, false],
  [/^\/notifications$/, misc.notifications, true]
];

const NAV = [
  { label: '공통', items: [['/jobs', '공고 찾기'], ['/notifications', '알림', true]] },
  { label: '알바생', items: [['/applications', '내 지원'], ['/resumes', '이력서'], ['/shifts', '내 근무'], ['/payrolls', '받은 정산']] },
  { label: '사장님', items: [['/my-jobs', '내 공고'], ['/applicants', '받은 지원'], ['/shifts/manage', '근무 관리'], ['/payrolls?tab=issued', '정산 발행']] }
];

const $main = document.getElementById('main');
const $head = document.getElementById('head');
let seq = 0;

function parseHash() {
  const raw = location.hash.slice(1) || '/jobs';
  const [path, query = ''] = raw.split('?');
  return { path, q: new URLSearchParams(query) };
}

function renderHeader() {
  const { path } = parseHash();
  const link = ([to, text, bell]) => {
    const base = to.split('?')[0];
    const full = location.hash.slice(1);
    let on;
    if (to.includes('?')) on = full.startsWith(to);                       // /payrolls?tab=issued
    else if (base === '/payrolls') on = path === '/payrolls' && !/tab=(issued|new)/.test(full) || /^\/payrolls\/\d+/.test(path);
    else if (base === '/jobs') on = path === '/jobs' || (/^\/jobs\/\d+/.test(path) && !state.me);
    else if (base === '/shifts') on = path === '/shifts';
    else on = path === base || path.startsWith(base + '/');
    return h`<a class="${on ? 'on' : ''}" href="#${to}">${text}${bell && state.unread ? h`<span class="n">${state.unread}</span>` : ''}</a>`;
  };
  const nav = state.me ? NAV : NAV.slice(0, 1);
  $head.innerHTML = h`<div class="bar">
    <a class="brand" href="#/jobs">알바 매칭</a>
    ${nav.map(g => h`<div class="grp"><span class="gl">${g.label}</span>${g.items.map(link)}</div>`)}
    <div class="who">${state.me
      ? h`<span>${state.me.name}님</span><button class="sm" data-act="logout">로그아웃</button>`
      : h`<a class="btn sm" href="#/login">로그인</a><a class="btn sm primary" href="#/join">가입</a>`}</div>
  </div>`.s;
}

async function refreshBell() {
  if (!state.me) { state.unread = 0; return; }
  try { state.unread = (await get('/notifications/unread-count')).count; } catch { /* 무시 */ }
  renderHeader();
}
state.refreshBell = refreshBell;

async function render() {
  const mySeq = ++seq;
  const { path, q } = parseHash();
  const hit = ROUTES.map(([re, view, auth]) => [path.match(re), view, auth]).find(([m]) => m);
  renderHeader();
  if (!hit) { $main.innerHTML = '<div class="empty">없는 화면입니다. <a href="#/jobs">공고 찾기</a></div>'; return; }
  const [m, view, auth] = hit;
  if (auth && !state.me) { toast('로그인이 필요합니다', 'err'); go('#/login'); return; }
  $main.innerHTML = '<div class="empty">불러오는 중…</div>';
  try {
    const out = await view({ params: m.slice(1), q, me: state.me });
    if (mySeq !== seq) return;               // 그 사이 다른 화면으로 이동했으면 버린다
    $main.innerHTML = out.toString();
  } catch (e) {
    if (mySeq !== seq) return;
    $main.innerHTML = `<div class="notice">${esc(e.message)}</div>`;
    if (e.status === 401) { state.me = null; renderHeader(); }
  }
  refreshBell();
}
state.rerender = render;

// 액션에서 난 오류는 토스트로, 401 이면 로그인 화면으로
setErrorHandler(e => {
  toast(e.message, 'err');
  if (e instanceof ApiError && e.status === 401) { state.me = null; go('#/login'); }
});

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
setInterval(refreshBell, 30000);

(async function start() {
  try { state.me = await get('/users/me'); } catch { state.me = null; }
  render();
})();
