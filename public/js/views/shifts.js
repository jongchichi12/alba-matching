// 근무: 알바생(내 근무 · 출퇴근) / 사장님(일정 등록 · 확인 · 결근)
import { get, post, patch } from '../api.js';
import { h, actions, toast, badge, dt, mins, options, localInput, toIso, day } from '../ui.js';
import { state, go, qs } from '../state.js';

// ---------- 알바생 ----------
export async function myShifts({ q }) {
  const from = q.get('from') || '', to = q.get('to') || '';
  const query = {};
  if (from) query.from = new Date(from + 'T00:00:00').toISOString();
  if (to) query.to = new Date(to + 'T23:59:59').toISOString();
  const list = await get('/shifts/me', query);
  return h`<h1>내 근무</h1>
  <form class="filters" data-form="shiftFilter">
    <label>시작일 <input type="date" name="from" value="${from}"></label>
    <label>종료일 <input type="date" name="to" value="${to}"></label>
    <button type="submit">조회</button>
  </form>
  <div class="muted small" style="margin-bottom:8px">출근은 예정 시작 시간 ±30분 안에서만 가능합니다. 퇴근 시각 − 출근 시각이 근무 시간이 됩니다.</div>
  ${list.length ? h`<div class="scroll"><table>
    <tr><th>공고</th><th>예정</th><th>출근</th><th>퇴근</th><th>근무</th><th>상태</th><th></th></tr>
    ${list.map(s => h`<tr>
      <td><a href="#/jobs/${s.Application.Job.id}">${s.Application.Job.title}</a><div class="muted small">${s.Application.Job.region}</div></td>
      <td class="small">${dt(s.startAt)}<br>~ ${dt(s.endAt)}</td>
      <td class="small">${dt(s.checkInAt)}</td><td class="small">${dt(s.checkOutAt)}</td>
      <td>${mins(s.workedMinutes)}</td><td>${badge(s.status)}</td>
      <td>${s.status === 'scheduled' ? h`<button class="sm primary" data-act="checkIn" data-id="${s.id}">출근</button>`
        : s.status === 'checked_in' ? h`<button class="sm primary" data-act="checkOut" data-id="${s.id}">퇴근</button>` : ''}</td>
    </tr>`)}
  </table></div>` : h`<div class="empty">근무 일정이 없습니다.</div>`}`;
}
actions.shiftFilter = async (_, f) => go('#/shifts' + qs({ from: f.from, to: f.to }));
actions.checkIn = async el => { await patch(`/shifts/${el.dataset.id}/check-in`); toast('출근 처리되었습니다'); state.rerender(); };
actions.checkOut = async el => { const s = await patch(`/shifts/${el.dataset.id}/check-out`); toast(`퇴근 처리되었습니다 (${mins(s.workedMinutes)})`); state.rerender(); };

// ---------- 사장님 ----------
export async function manageShifts({ q }) {
  const { jobs } = await get('/jobs', { mine: 'true', status: 'all', limit: 50 });
  if (!jobs.length) return h`<h1>근무 관리</h1><div class="empty">먼저 <a href="#/jobs/new">공고를 등록</a>하세요.</div>`;
  const jobId = q.get('jobId') || String(jobs[0].id);
  const [shifts, accepted] = await Promise.all([
    get(`/shifts/jobs/${jobId}`),
    get('/applications/received', { jobId, status: 'accepted' })
  ]);
  return h`<h1>근무 관리</h1>
  <form class="filters" data-form="shiftJob">
    <label>공고 <select name="jobId">${options(jobs.map(j => [j.id, `#${j.id} ${j.title}`]), jobId)}</select></label>
    <button type="submit">보기</button>
  </form>

  <h2>일정 등록</h2>
  ${accepted.length ? h`<form class="card form" data-form="shiftCreate">
    <label>알바생 (확정된 지원) <select name="applicationId">${options(accepted.map(a => [a.id, `${a.applicant.name} (지원 #${a.id})`]))}</select></label>
    <label>시작 <input type="datetime-local" name="startAt" value="${localInput(0)}" required></label>
    <label>종료 <input type="datetime-local" name="endAt" value="${localInput(60)}" required></label>
    <button class="primary" type="submit">일정 등록</button>
    <div class="muted small" style="margin-top:6px">같은 알바생의 다른 일정과 시간이 겹치면 등록되지 않습니다.</div>
  </form>` : h`<div class="notice">확정된 지원이 없습니다. <a href="#/applicants?jobId=${jobId}">지원자 보기</a></div>`}

  <h2>일정 목록</h2>
  ${shifts.length ? h`<div class="scroll"><table>
    <tr><th>알바생</th><th>예정</th><th>출근</th><th>퇴근</th><th>근무</th><th>상태</th><th>작업</th></tr>
    ${shifts.map(s => h`<tr>
      <td>${s.Application.applicant.name}</td>
      <td class="small">${dt(s.startAt)}<br>~ ${dt(s.endAt)}</td>
      <td class="small">${dt(s.checkInAt)}</td><td class="small">${dt(s.checkOutAt)}</td>
      <td>${mins(s.workedMinutes)}</td><td>${badge(s.status)}</td>
      <td><div class="row">
        ${s.status === 'checked_out' ? h`<button class="sm primary" data-act="shiftConfirm" data-id="${s.id}">근무 확인</button>` : ''}
        ${s.status === 'scheduled' ? h`<button class="sm danger" data-act="shiftNoShow" data-id="${s.id}" data-confirm="결근 처리할까요? (시작 시간이 지난 일정만 가능)">결근</button>` : ''}
      </div></td></tr>`)}
  </table></div>` : h`<div class="empty">등록된 일정이 없습니다.</div>`}`;
}
actions.shiftJob = async (_, f) => go('#/shifts/manage' + qs({ jobId: f.jobId }));
actions.shiftCreate = async (_, f) => {
  await post('/shifts', { applicationId: Number(f.applicationId), startAt: toIso(f.startAt), endAt: toIso(f.endAt) });
  toast('일정을 등록했습니다 (알바생에게 알림)');
  state.rerender();
};
actions.shiftConfirm = async el => { await patch(`/shifts/${el.dataset.id}/confirm`); toast('근무를 확인했습니다'); state.rerender(); };
actions.shiftNoShow = async el => { await patch(`/shifts/${el.dataset.id}/no-show`); toast('결근 처리했습니다'); state.rerender(); };
