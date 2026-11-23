// 이력서 + 인증 경력
import { get, post, patch, del } from '../api.js';
import { h, actions, toast, day, mins, stars } from '../ui.js';
import { state, go } from '../state.js';

export async function resumesList() {
  const list = await get('/resumes/me');
  return h`<div class="row between"><h1>내 이력서</h1><a class="btn primary" href="#/resumes/new">+ 새 이력서</a></div>
  ${list.length ? list.map(r => h`<div class="card">
    <div class="row between"><a href="#/resumes/${r.id}"><b>${r.title}</b></a><span class="muted small">희망지역 ${r.desiredRegion}</span></div>
    <div class="small" style="margin:4px 0">${r.intro.length > 120 ? r.intro.slice(0, 120) + '…' : r.intro}</div>
    <div class="row">
      <a class="btn sm" href="#/resumes/${r.id}">경력 보기</a>
      <a class="btn sm" href="#/resumes/${r.id}/edit">수정</a>
      <button class="sm danger" data-act="resumeDelete" data-id="${r.id}" data-confirm="이력서를 삭제할까요?">삭제</button>
    </div></div>`) : h`<div class="empty">작성한 이력서가 없습니다.</div>`}`;
}

function resumeForm(r) {
  const edit = !!r;
  return h`<form class="form card" data-form="${edit ? 'resumeUpdate' : 'resumeCreate'}">
    ${edit ? h`<input type="hidden" name="id" value="${r.id}">` : ''}
    <label>제목 <input name="title" maxlength="100" required value="${edit ? r.title : ''}"></label>
    <label>희망 지역 <input name="desiredRegion" maxlength="50" required value="${edit ? r.desiredRegion : ''}"></label>
    <label>자기소개 <textarea name="intro" required>${edit ? r.intro : ''}</textarea></label>
    <button class="primary" type="submit">${edit ? '저장' : '작성'}</button>
  </form>`;
}
const body = f => ({ title: f.title.trim(), desiredRegion: f.desiredRegion.trim(), intro: f.intro.trim() });

export async function resumeNew() { return h`<h1>이력서 작성</h1>${resumeForm()}`; }
export async function resumeEdit({ params }) {
  const r = await get(`/resumes/${params[0]}`);
  return h`<h1>이력서 수정</h1>${resumeForm(r)}`;
}
actions.resumeCreate = async (_, f) => { const r = await post('/resumes', body(f)); toast('작성되었습니다'); go(`#/resumes/${r.id}`); };
actions.resumeUpdate = async (_, f) => { await patch(`/resumes/${f.id}`, body(f)); toast('저장되었습니다'); go(`#/resumes/${f.id}`); };
actions.resumeDelete = async el => { await del(`/resumes/${el.dataset.id}`); toast('삭제되었습니다'); state.rerender(); };

export async function resumeDetail({ params }) {
  const id = params[0];
  const [r, c] = await Promise.all([get(`/resumes/${id}`), get(`/resumes/${id}/careers`)]);
  const mine = state.me && r.userId === state.me.id;
  return h`<div class="row between"><h1>${r.title}</h1>
    ${mine ? h`<a class="btn" href="#/resumes/${r.id}/edit">수정</a>` : ''}</div>
  <div class="card"><dl class="kv"><dt>희망 지역</dt><dd>${r.desiredRegion}</dd><dt>자기소개</dt><dd style="white-space:pre-wrap">${r.intro}</dd></dl></div>

  <h2>인증 경력 <span class="muted small">(완료된 근무와 사장님 확인 기록으로 서버가 계산)</span></h2>
  <div class="card"><dl class="kv">
    <dt>완료한 근무</dt><dd>${c.count}건</dd>
    <dt>총 근무 시간</dt><dd>${mins(c.totalWorkedMinutes)} (${c.totalWorkedDays}일)</dd>
    <dt>평균 성실도</dt><dd>${stars(c.avgRating)}</dd>
    <dt>결근</dt><dd>${c.totalNoShowCount}회</dd>
  </dl></div>
  ${c.careers.length ? h`<div class="scroll"><table>
    <tr><th>공고</th><th>사장님</th><th>기간</th><th>근무</th><th>결근</th><th>성실도</th></tr>
    ${c.careers.map(x => h`<tr>
      <td>${x.jobTitle}<div class="muted small">${x.category || ''} ${x.region}</div></td>
      <td><a href="#/owners/${x.ownerId}">${x.owner}</a></td>
      <td class="small">${day(x.startedAt)} ~ ${day(x.endedAt)}</td>
      <td>${mins(x.workedMinutes)} (${x.workedDays}일)</td>
      <td>${x.noShowCount}</td>
      <td>${x.ownerRating ? x.ownerRating + '점' : '-'}</td></tr>`)}
  </table></div>` : h`<div class="empty">아직 인증된 경력이 없습니다.</div>`}`;
}
