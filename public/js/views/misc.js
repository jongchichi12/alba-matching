// 로그인 · 가입 · 알림
import { get, post, patch, del } from '../api.js';
import { h, actions, toast, dt, raw } from '../ui.js';
import { state, go, qs } from '../state.js';

export async function login() {
  return h`<h1>로그인</h1>
  <form class="form card" data-form="login">
    <label>이메일 <input name="email" type="email" required autofocus></label>
    <label>비밀번호 <input name="password" type="password" required></label>
    <button class="primary" type="submit">로그인</button>
    <span class="muted small"> 계정이 없으면 <a href="#/join">회원가입</a></span>
  </form>`;
}

export async function join() {
  return h`<h1>회원가입</h1>
  <form class="form card" data-form="join">
    <label>이메일 <input name="email" type="email" required></label>
    <label>비밀번호 (6~50자) <input name="password" type="password" minlength="6" maxlength="50" required></label>
    <label>이름 <input name="name" maxlength="20" required></label>
    <label>전화번호 <input name="phone" maxlength="20"></label>
    <button class="primary" type="submit">가입하기</button>
    <div class="muted small" style="margin-top:8px">사장님·알바생 구분 없이 한 계정으로 둘 다 할 수 있습니다.</div>
  </form>`;
}

actions.login = async (_, f) => {
  state.me = await post('/users/login', { email: f.email.trim(), password: f.password });
  toast(`${state.me.name}님 환영합니다`);
  go('#/jobs');
};
actions.join = async (_, f) => {
  const body = { email: f.email.trim(), password: f.password, name: f.name.trim() };
  if (f.phone.trim()) body.phone = f.phone.trim();
  await post('/users/join', body);
  state.me = await post('/users/login', { email: body.email, password: body.password });
  toast('가입되었습니다');
  go('#/jobs');
};
actions.logout = async () => {
  await post('/users/logout');
  state.me = null; state.unread = 0;
  toast('로그아웃되었습니다');
  go('#/jobs');
};

// ---------- 알림 ----------
const TARGET = {
  application_received: () => '#/applicants',
  application_accepted: () => '#/applications',
  application_rejected: () => '#/applications',
  application_completed: () => '#/applications',
  shift_created: () => '#/shifts',
  payroll_issued: id => `#/payrolls/${id}`,
  payroll_disputed: id => `#/payrolls/${id}`,
  review_created: () => ''
};

export async function notifications({ q }) {
  const unreadOnly = q.get('unread') === 'true';
  const list = await get('/notifications', { unread: unreadOnly ? 'true' : '' });
  return h`<div class="row between"><h1>알림</h1>
    <div class="row">
      <a class="btn sm" href="#/notifications${qs({ unread: unreadOnly ? '' : 'true' })}">${unreadOnly ? '전체 보기' : '안읽은 것만'}</a>
      <button class="sm" data-act="readAll">모두 읽음</button>
    </div></div>
  ${list.length ? h`<ul class="notis">${list.map(n => {
    const link = (TARGET[n.type] || (() => ''))(n.targetId);
    return h`<li>
      <span class="dot ${n.isRead ? 'read' : ''}"></span>
      <span class="msg">${link ? h`<a href="${link}" data-act="readGo" data-id="${n.id}" data-to="${link}">${n.message}</a>` : n.message}
        <div class="muted small">${dt(n.createdAt)}</div></span>
      ${n.isRead ? '' : h`<button class="sm" data-act="readOne" data-id="${n.id}">읽음</button>`}
      <button class="sm danger" data-act="delNoti" data-id="${n.id}">삭제</button>
    </li>`;
  })}</ul>` : h`<div class="empty">알림이 없습니다.</div>`}`;
}

actions.readAll = async () => { await patch('/notifications/read-all'); state.rerender(); };
actions.readOne = async el => { await patch(`/notifications/${el.dataset.id}/read`); state.rerender(); };
actions.readGo = async el => { await patch(`/notifications/${el.dataset.id}/read`); go(el.dataset.to); };
actions.delNoti = async el => { await del(`/notifications/${el.dataset.id}`); state.rerender(); };
