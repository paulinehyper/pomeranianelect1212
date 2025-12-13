async function fetchTodos() {
  return await window.electronAPI.getTodos();
}

function renderList(todos) {
  const list = document.querySelector('.schedule-list');
  list.innerHTML = '';
  let dragSrcIdx = null;
  todos.forEach((item, idx) => {
    const li = document.createElement('li');
    li.setAttribute('draggable', 'true');
    li.setAttribute('data-idx', idx);

    // Drag & Drop 이벤트
    li.addEventListener('dragstart', (e) => {
      dragSrcIdx = idx;
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', (e) => {
      li.classList.remove('dragging');
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', (e) => {
      li.classList.remove('drag-over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (dragSrcIdx !== null && dragSrcIdx !== idx) {
        // 순서 변경
        const newTodos = [...todos];
        const [moved] = newTodos.splice(dragSrcIdx, 1);
        newTodos.splice(idx, 0, moved);
        renderList(newTodos);
      }
    });
    // 연필(편집) 아이콘 및 메모 입력란(초기 숨김)
    const memo = item.memo || '';
    // deadline 표시: item.deadline이 있고, date와 다를 때만 보여주기
    let deadlineHtml = '';
    if (item.deadline && item.deadline !== '없음' && item.deadline !== item.date) {
      deadlineHtml = `<span class="deadline" style="color:#b48a00;font-weight:bold;margin-right:6px;">마감: ${item.deadline}</span>`;
    }
    // 완료 상태인지 확인 (이메일 기반만 지원)
    const isMail = typeof item.id === 'string' && item.id.startsWith('mail-');
    const isCompleted = isMail && item.todo_flag === 2;
    li.innerHTML = `
      ${deadlineHtml}
      <span class="date">${item.date}</span> 
      <span class="d-day">${item.dday}</span> 
      <span class="task" style="${isCompleted ? 'text-decoration:line-through;color:#aaa;' : ''}">${item.task}</span>
      <button class="memo-edit-btn" title="메모 추가/수정" style="background:transparent;border:none;cursor:pointer;margin-left:8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="18" rx="3" fill="#ffe07a" stroke="#b48a00" stroke-width="1.5"/>
          <path d="M16 21v-4a1 1 0 0 1 1-1h4" stroke="#b48a00" stroke-width="1.5" fill="#fffbe7"/>
        </svg>
      </button>
      <button class="exclude-btn" title="할일 목록에서 제외" style="background:transparent;border:none;cursor:pointer;margin-left:4px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="16" height="16" rx="3" fill="#e0e0e0" stroke="#888" stroke-width="1.5"/>
          <path d="M8 12h8" stroke="#888" stroke-width="2"/>
        </svg>
      </button>
      <textarea class="memo" placeholder="메모/부연설명" rows="2" style="display:none;">${memo}</textarea>
    `;
        // 더블클릭 시 취소선 토글 및 완료 처리
        const taskSpan = li.querySelector('.task');
        if (taskSpan && !isCompleted) {
          taskSpan.addEventListener('dblclick', async () => {
            // 이메일 기반 todo만 완료 처리 (id가 mail-로 시작)
            if (typeof item.id === 'string' && item.id.startsWith('mail-')) {
              await window.electronAPI.setEmailTodoComplete(item.id.replace('mail-', ''));
            }
            // 취소선 토글(즉시 반영)
            taskSpan.style.textDecoration = 'line-through';
            taskSpan.style.color = '#aaa';
            // 목록 새로고침
            const todos = await fetchTodos();
            renderList(todos);
          });
        }
    const editBtn = li.querySelector('.memo-edit-btn');
    const excludeBtn = li.querySelector('.exclude-btn');
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
    // 제외 버튼 클릭 시 확인창 후 제외 처리
    excludeBtn.addEventListener('click', async () => {
      if (confirm('할일 목록에서 제외하시겠습니까?')) {
        // 이메일 기반 todo만 제외 처리 (id가 mail-로 시작)
        if (typeof item.id === 'string' && item.id.startsWith('mail-')) {
          await window.electronAPI.setEmailTodoFlag(item.id.replace('mail-', ''), 0);
        }
        // 제외 후 목록 새로고침
        const todos = await fetchTodos();
        renderList(todos);
      }
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

// 1분마다 실시간으로 todo 목록 새로고침
setInterval(async () => {
  const todos = await fetchTodos();
  renderList(todos);
}, 60 * 1000);

// 새로고침 버튼 추가 및 동작 구현
const headerRight = document.querySelector('.header-right');
const refreshBtn = document.createElement('button');
refreshBtn.className = 'refresh-btn';
refreshBtn.title = '새로고침';
refreshBtn.style.marginRight = '8px';
refreshBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 10a6 6 0 1 1 6 6" stroke="#b48a00" stroke-width="1.5" fill="none"/><path d="M4 14v-4h4" stroke="#b48a00" stroke-width="1.5" fill="none"/></svg>`;
headerRight.insertBefore(refreshBtn, headerRight.firstChild);
refreshBtn.addEventListener('click', async () => {
  const todos = await fetchTodos();
  renderList(todos);
});
