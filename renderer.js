async function fetchTodos() {
  return await window.electronAPI.getTodos();
}

function renderList(todos) {
  const list = document.querySelector('.schedule-list');
  list.innerHTML = '';
  todos.forEach((item, idx) => {
    const li = document.createElement('li');
    li.setAttribute('draggable', 'true');
    li.setAttribute('data-idx', idx);
    // 연필(편집) 아이콘 및 메모 입력란(초기 숨김)
    const memo = item.memo || '';
      li.innerHTML = `
        <span class="date">${item.date}</span> 
        <span class="d-day">${item.dday}</span> 
        <span class="task">${item.task}</span>
        <button class="memo-edit-btn" title="메모 추가/수정" style="background:transparent;border:none;cursor:pointer;margin-left:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="#ffe07a" stroke="#b48a00" stroke-width="1.5"/>
            <path d="M16 21v-4a1 1 0 0 1 1-1h4" stroke="#b48a00" stroke-width="1.5" fill="#fffbe7"/>
          </svg>
        </button>
        <textarea class="memo" placeholder="메모/부연설명" rows="2" style="display:none;">${memo}</textarea>
      `;
    const editBtn = li.querySelector('.memo-edit-btn');
    const textarea = li.querySelector('.memo');
    editBtn.addEventListener('click', () => {
      if (textarea.style.display === 'none') {
        textarea.style.display = 'block';
        textarea.focus();
      } else {
        textarea.style.display = 'none';
      }
    });
    textarea.addEventListener('input', (e) => {
      window.electronAPI.saveMemo(item.id, e.target.value);
    });
    list.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const todos = await fetchTodos();
  renderList(todos);
});

// 연동하기 버튼(이메일 연동) 클릭 시 새 메일만 동기화
// settings-btn이 연동 버튼임을 가정
const syncBtn = document.querySelector('.settings-btn');
syncBtn.addEventListener('click', async () => {
  // 메일 설정 가져오기
  const settings = await window.electronAPI.getMailSettings();
  if (!settings) {
    window.electronAPI.openSettings();
    return;
  }
  // DB에서 가장 최근 메일 날짜 조회
  const latest = await window.electronAPI.getEmails().then(list =>
    list && list.length > 0 ? list.reduce((a, b) => a.received_at > b.received_at ? a : b).received_at : undefined
  );
  const info = {
    mailType: settings.mail_type,
    protocol: settings.protocol,
    mailId: settings.mail_id,
    mailPw: settings.mail_pw,
    mailSince: latest
  };
  // 메일 연동(최신 메일 이후만)
  await window.electronAPI.mailConnect(info);
  // 동기화 후 목록 새로고침
  const todos = await fetchTodos();
  renderList(todos);
});
