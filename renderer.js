// 할일 목록 데이터 (임시)
const todos = [
  { date: '1/10', dday: 'D-3', task: '할일1' },
  { date: '1/12', dday: 'D-5', task: '할일2' },
  { date: '1/15', dday: 'D-8', task: '할일3' }
];

function renderList() {
  const list = document.querySelector('.schedule-list');
  list.innerHTML = '';
  todos.forEach((item, idx) => {
    const li = document.createElement('li');
    li.setAttribute('draggable', 'true');
    li.setAttribute('data-idx', idx);
    li.innerHTML = `<span class="date">${item.date}</span> <span class="d-day">${item.dday}</span> <span class="task">${item.task}</span>`;
    list.appendChild(li);
  });
}

function swapTodos(from, to) {
  const temp = todos[from];
  todos[from] = todos[to];
  todos[to] = temp;
}

document.addEventListener('DOMContentLoaded', () => {
  renderList();
  let dragIdx = null;
  document.querySelector('.schedule-list').addEventListener('dragstart', e => {
    dragIdx = +e.target.getAttribute('data-idx');
    e.dataTransfer.effectAllowed = 'move';
  });
  document.querySelector('.schedule-list').addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  document.querySelector('.schedule-list').addEventListener('drop', e => {
    e.preventDefault();
    const dropIdx = +e.target.closest('li').getAttribute('data-idx');
    if (dragIdx !== null && dragIdx !== dropIdx) {
      swapTodos(dragIdx, dropIdx);
      renderList();
    }
    dragIdx = null;
  });
});
