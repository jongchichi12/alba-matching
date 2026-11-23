// 서버 호출 한 곳으로 모은 모듈. 성공이면 data 를 돌려주고, 실패면 Error(status, message) 를 던진다.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(method, url, body, query) {
  const qs = query
    ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString()
    : '';
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined && method !== 'GET') {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(qs ? `${url}?${qs}` : url, opt);
  } catch (e) {
    throw new ApiError(0, '서버에 연결할 수 없습니다.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.result !== 'Success') {
    throw new ApiError(res.status, (json && json.error) || `요청 실패 (${res.status})`);
  }
  return json.data;
}

export const get = (url, query) => api('GET', url, undefined, query);
export const post = (url, body) => api('POST', url, body ?? {});
export const patch = (url, body) => api('PATCH', url, body ?? {});
export const del = url => api('DELETE', url);
