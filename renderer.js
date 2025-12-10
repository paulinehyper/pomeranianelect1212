
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
    li.innerHTML = `<span class="date">${item.date}</span> <span class="d-day">${item.dday}</span> <span class="task">${item.task}</span>`;
    list.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const todos = await fetchTodos();
  renderList(todos);
});
