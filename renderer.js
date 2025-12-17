// 환경설정(톱니바퀴) 아이콘 클릭 시 app-settings.html 새 창 열기
document.addEventListener('DOMContentLoaded', () => {
  const cogBtn = document.querySelector('.cog-btn');
  if (cogBtn) {
    cogBtn.addEventListener('click', () => {
      window.electronAPI.openAppSettings();
    });
  }
});
// 할일 추가 플로팅 버튼 및 모달 동작
document.addEventListener('DOMContentLoaded', () => {
  const fab = document.getElementById('add-todo-fab');
  const modal = document.getElementById('add-todo-modal');
  const closeBtn = document.getElementById('close-add-todo-modal');
  const saveBtn = document.getElementById('save-add-todo');
  const taskInput = document.getElementById('add-todo-task');
  const deadlineInput = document.getElementById('add-todo-deadline');
  if (fab && modal && closeBtn && saveBtn && taskInput && deadlineInput) {
    fab.onclick = () => {
      modal.style.display = 'flex';
      taskInput.value = '';
      deadlineInput.value = '';
      setTimeout(() => taskInput.focus(), 100);
    };
    closeBtn.onclick = () => { modal.style.display = 'none'; };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    saveBtn.onclick = async () => {
      const task = taskInput.value.trim();
      const deadline = deadlineInput.value;
      if (!task) { taskInput.focus(); return; }
      // DB에 저장 (electronAPI에 insertTodo가 있다고 가정)
      await window.electronAPI.insertTodo({ task, deadline });
      modal.style.display = 'none';
      const todos = await fetchTodos();
      renderList(todos);
    };
    taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
    deadlineInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
  }
});
// 완료된 할일 목록 가져오기
async function fetchCompletedTodos() {
  return (await window.electronAPI.getTodos()).filter(todo => todo.todo_flag === 2);
}

function renderCompletedList(todos) {
  const list = document.getElementById('completed-list');
  list.innerHTML = '';
  if (!todos.length) {
    list.innerHTML = '<li style="color:#888;">완료된 할일이 없습니다.</li>';
    return;
  }
  todos.forEach(todo => {
    const li = document.createElement('li');
    li.style.marginBottom = '8px';
    li.innerHTML = `<span style="text-decoration:line-through;color:#00b49cff;">${todo.task}</span> <span style="color:#b48a00;">${todo.deadline ? '('+todo.deadline+')' : ''}</span>`;
    list.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const completedBtn = document.querySelector('.completed-btn');
  const completedModal = document.getElementById('completed-modal');
  const closeCompletedModal = document.getElementById('close-completed-modal');
  if (completedBtn && completedModal && closeCompletedModal) {
    completedBtn.addEventListener('click', async () => {
      const completed = await fetchCompletedTodos();
      renderCompletedList(completed);
      completedModal.style.display = 'flex';
    });
    closeCompletedModal.addEventListener('click', () => {
      completedModal.style.display = 'none';
    });
    completedModal.addEventListener('click', (e) => {
      if (e.target === completedModal) completedModal.style.display = 'none';
    });
  }
});
async function fetchTodos() {
  return await window.electronAPI.getTodos();
}

function renderList(todos) {
  const list = document.querySelector('.schedule-list');
  list.innerHTML = '';
  if (!todos || todos.length === 0) {
    const li = document.createElement('li');
    li.textContent = '할일이 없습니다.';
    li.style.color = '#888';
    li.style.textAlign = 'center';
    list.appendChild(li);
    return;
  }
  let dragSrcIdx = null;
  // 데드라인이 빠른 순서로 정렬 (없음/미설정은 맨 뒤)
  const sortedTodos = [...todos].sort((a, b) => {
    if (!a.deadline || a.deadline === '없음') return 1;
    if (!b.deadline || b.deadline === '없음') return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  sortedTodos.forEach((item, idx) => {
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
    let isUrgent = false;
    if (item.deadline && item.deadline !== '없음' && item.deadline !== item.date) {
      deadlineHtml = `<span class="deadline" style="color:#00b49cff;font-weight:bold;margin-right:6px;">마감: ${item.deadline}</span>`;
      // 오늘이거나 이미 지난 데드라인이면 긴급
      const today = new Date();
      const deadlineDate = new Date(item.deadline);
      today.setHours(0,0,0,0);
      deadlineDate.setHours(0,0,0,0);
      if (deadlineDate <= today) isUrgent = true;
    }
    // 완료 상태인지 확인 (이메일 기반만 지원)
    const isMail = typeof item.id === 'string' && item.id.startsWith('mail-');
    const isCompleted = isMail && item.todo_flag === 2;
    li.innerHTML = `
      ${deadlineHtml}
      <span class="date">${item.date} </span>
      <span style="display:inline-block;width:8px;"></span>
      <span class="d-day">${item.dday}</span>
      <span style="display:inline-block;width:8px;"></span>
      <span class="task" style="${isCompleted ? 'text-decoration:line-through;color:#aaa;' : ''}">${item.task}</span>
      <button class="memo-edit-btn" title="메모 추가/수정" style="background:transparent;border:none;cursor:pointer;margin-left:8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="18" rx="3" fill="#7affcaff" stroke="#00b49cff" stroke-width="1.5"/>
          <path d="M16 21v-4a1 1 0 0 1 1-1h4" stroke="#00b478ff" stroke-width="1.5" fill="#ffffffff"/>
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
    if (isUrgent) li.classList.add('urgent-blink');
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
            taskSpan.style.color = '#01fad0ff';
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
        if (typeof item.id === 'string' && item.id.startsWith('mail-')) {
          await window.electronAPI.setEmailTodoFlag(item.id.replace('mail-', ''), 0);
        } else {
          await window.electronAPI.excludeTodo(item.id);
        }
        // 제외 후 목록 새로고침
        const todos = await fetchTodos();
        renderList(todos);
        // 메일 목록도 새로고침 (openEmails은 emails.html 창을 포커싱/오픈)
        if (window.electronAPI.openEmails) {
          window.electronAPI.openEmails();
        }
      }
    });
    list.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const todos = await fetchTodos();
  renderList(todos);
  // 앱 시작 시 메일 설정이 있으면 자동 연동
  const settings = await window.electronAPI.getMailSettings();
  if (settings && settings.mail_id && settings.mail_pw && settings.protocol && settings.mail_type) {
    // DB에서 가장 최근 메일 날짜 조회
    const latest = await window.electronAPI.getEmails().then(list =>
      list && list.length > 0 ? list.reduce((a, b) => a.received_at > b.received_at ? a : b).received_at : undefined
    );
    const info = {
      mailType: settings.mail_type,
      protocol: settings.protocol,
      mailId: settings.mail_id,
      mailPw: settings.mail_pw,
      mailSince: latest,
      mailServer: settings.mail_server 
    };
    await window.electronAPI.mailConnect(info);
  }
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
        mailSince: latest, 
        mailServer: settings.mail_server || ''
      };
      // 메일 연동(최신 메일 이후만)
      const result = await window.electronAPI.mailConnect(info);
      // 연동 성공 시 자동 저장
      if (result && result.success) {
        await window.electronAPI.saveMailSettings({
          mailType: info.mailType,
          protocol: info.protocol,
          mailId: info.mailId,
          mailPw: info.mailPw,
          mailSince: info.mailSince,
          mailServer: settings.mail_server || ''
        });
      }
      // 동기화 후 목록 새로고침
      const todos = await fetchTodos();
      renderList(todos);
    });

// 1분마다 실시간으로 todo 목록 새로고침
setInterval(async () => {
  const todos = await fetchTodos();
  renderList(todos);
}, 60 * 1000);

// 새로고침/전체삭제 버튼 추가 및 동작 구현
const headerRight = document.querySelector('.header-right');
const refreshBtn = document.createElement('button');
refreshBtn.className = 'refresh-btn';
refreshBtn.title = '새로고침';
refreshBtn.style.marginRight = '8px';
refreshBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.65 6.35A8 8 0 1 0 20 12" stroke="#00b48a" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="20,4 20,8 16,8" stroke="#00b48a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
headerRight.insertBefore(refreshBtn, headerRight.firstChild);
refreshBtn.addEventListener('click', async () => {
  // 이메일 todo를 todos에 반영
  if (window.electronAPI.refreshTodosFromEmails) {
    await window.electronAPI.refreshTodosFromEmails();
  }
  const todos = await fetchTodos();
  renderList(todos);
});

const deleteAllBtn = document.createElement('button');
deleteAllBtn.className = 'delete-all-btn';
deleteAllBtn.title = '전체 할일 삭제';
deleteAllBtn.style.marginRight = '8px';
deleteAllBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="3" fill="#ffe0e0" stroke="#e00" stroke-width="1.5"/><path d="M8 12h8" stroke="#e00" stroke-width="2"/></svg>`;
headerRight.insertBefore(deleteAllBtn, headerRight.firstChild);
deleteAllBtn.addEventListener('click', async () => {
  if (confirm('정말 전체 할일을 삭제하시겠습니까?')) {
    await window.electronAPI.deleteAllTodos();
    const todos = await fetchTodos();
    renderList(todos);
  }
});
