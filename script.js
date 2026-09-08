/* ---------------- state ---------------- */
const CATEGORIES = {
  expense: ['Food','Transport','Housing','Utilities','Entertainment','Health','Shopping','Other'],
  income: ['Salary','Freelance','Gift','Other']
};

let state = {
  transactions: JSON.parse(localStorage.getItem('fp_transactions') || '[]'),
  budgets: JSON.parse(localStorage.getItem('fp_budgets') || '[]'),
  goals: JSON.parse(localStorage.getItem('fp_goals') || '[]'),
  currency: localStorage.getItem('fp_currency') || '₦'
};

function persist(){
  localStorage.setItem('fp_transactions', JSON.stringify(state.transactions));
  localStorage.setItem('fp_budgets', JSON.stringify(state.budgets));
  localStorage.setItem('fp_goals', JSON.stringify(state.goals));
  localStorage.setItem('fp_currency', state.currency);
}

function fmt(n){
  return Number(n||0).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function cur(){ return state.currency; }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------------- toast (undo) ---------------- */
let toastTimeout = null;
function showUndoToast(message, undoFn){
  clearTimeout(toastTimeout);
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = message;
  toast.classList.add('show');
  const undoBtn = document.getElementById('toastUndo');
  undoBtn.onclick = () => { undoFn(); hideToast(); };
  toastTimeout = setTimeout(hideToast, 6000);
}
function hideToast(){
  document.getElementById('toast').classList.remove('show');
}

/* ---------------- nav ---------------- */
document.getElementById('nav').addEventListener('click', e=>{
  const btn = e.target.closest('.nav-item');
  if(!btn) return;
  goTo(btn.dataset.section);
});
function goTo(name){
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.section===name));
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active', s.id===name));
  renderAll();
}

/* ---------------- category selects ---------------- */
function fillCategorySelect(sel, type){
  sel.innerHTML = CATEGORIES[type].map(c=>`<option value="${c}">${c}</option>`).join('');
}
function fillFilterCategories(){
  const all = [...new Set(state.transactions.map(t=>t.category))].sort();
  const sel = document.getElementById('filterCategory');
  const current = sel.value;
  sel.innerHTML = '<option value="all">All categories</option>' + all.map(c=>`<option value="${c}">${c}</option>`).join('');
  if([...sel.options].some(o=>o.value===current)) sel.value = current;
}

/* ---------------- transaction form (add + edit) ---------------- */
let currentType = 'expense';
let editingId = null; // set while editing an existing entry, null when adding new

document.getElementById('typeToggle').addEventListener('click', e=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeToggle button').forEach(b=>b.classList.toggle('on', b===btn));
  fillCategorySelect(document.getElementById('txCategory'), currentType);
});

function openForm(){
  editingId = null;
  currentType = 'expense';
  document.getElementById('txPanelTitle').textContent = 'New entry';
  document.getElementById('txSaveBtn').textContent = 'Save entry';
  document.getElementById('txPanel').classList.add('open');
  document.getElementById('txAmount').value = '';
  document.getElementById('txDesc').value = '';
  document.getElementById('txDate').value = todayISO();
  document.querySelectorAll('#typeToggle button').forEach(b=>b.classList.toggle('on', b.dataset.type==='expense'));
  fillCategorySelect(document.getElementById('txCategory'), currentType);
}

function editTransaction(id){
  const t = state.transactions.find(x=>x.id===id);
  if(!t) return;
  editingId = id;
  currentType = t.type;
  document.getElementById('txPanelTitle').textContent = 'Edit entry';
  document.getElementById('txSaveBtn').textContent = 'Save changes';
  document.getElementById('txPanel').classList.add('open');
  document.querySelectorAll('#typeToggle button').forEach(b=>b.classList.toggle('on', b.dataset.type===t.type));
  fillCategorySelect(document.getElementById('txCategory'), t.type);
  document.getElementById('txCategory').value = t.category;
  document.getElementById('txAmount').value = t.amount;
  document.getElementById('txDesc').value = t.desc;
  document.getElementById('txDate').value = t.date;
  document.getElementById('txPanel').scrollIntoView({behavior:'smooth', block:'start'});
}

function closeForm(){
  document.getElementById('txPanel').classList.remove('open');
  editingId = null;
}

function submitTransaction(){
  const amount = parseFloat(document.getElementById('txAmount').value);
  const desc = document.getElementById('txDesc').value.trim();
  const category = document.getElementById('txCategory').value;
  const date = document.getElementById('txDate').value || todayISO();
  if(!amount || amount<=0){ alert('Enter an amount greater than zero.'); return; }
  if(!desc){ alert('Give this entry a short description.'); return; }

  if(editingId){
    const t = state.transactions.find(x=>x.id===editingId);
    if(t){ t.type = currentType; t.amount = amount; t.category = category; t.desc = desc; t.date = date; }
  } else {
    state.transactions.push({ id:uid(), type:currentType, amount, category, desc, date });
  }
  persist();
  closeForm();
  renderAll();
}

function deleteTransaction(id){
  const idx = state.transactions.findIndex(t=>t.id===id);
  if(idx===-1) return;
  const [removed] = state.transactions.splice(idx,1);
  persist();
  renderAll();
  showUndoToast('Entry deleted', () => {
    state.transactions.splice(idx,0,removed);
    persist();
    renderAll();
  });
}

/* ---------------- rendering: ledger row ---------------- */
function ledgerRow(t){
  const sign = t.type==='income' ? '+' : '−';
  return `
  <div class="ledger-row">
    <div class="tick ${t.type}"></div>
    <div class="l-main">
      <div class="l-desc">${escapeHTML(t.desc)}</div>
      <div class="l-meta"><span class="cat">${t.category}</span> · ${formatDate(t.date)}</div>
    </div>
    <div class="l-amount mono ${t.type}">${sign}${cur()}${fmt(t.amount)}</div>
    <div class="l-actions">
      <button class="l-edit" onclick="editTransaction('${t.id}')" aria-label="Edit entry">✎</button>
      <button class="l-del btn-danger-text" onclick="deleteTransaction('${t.id}')" aria-label="Delete entry">✕</button>
    </div>
  </div>`;
}
function formatDate(iso){
  const d = new Date(iso+'T00:00:00');
  if(isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
}
function escapeHTML(s){
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

/* ---------------- dashboard ---------------- */
function renderDashboard(){
  const income = sum(state.transactions.filter(t=>t.type==='income'));
  const expense = sum(state.transactions.filter(t=>t.type==='expense'));
  document.getElementById('dashCur').textContent = cur();
  document.getElementById('dashBalance').textContent = fmt(income-expense);
  document.getElementById('dashIncome').textContent = cur()+fmt(income);
  document.getElementById('dashExpense').textContent = cur()+fmt(expense);
  document.getElementById('dashCount').textContent = state.transactions.length;

  const recent = [...state.transactions].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,6);
  const box = document.getElementById('dashRecent');
  box.innerHTML = recent.length ? recent.map(ledgerRow).join('') :
    `<div class="empty"><strong>No entries yet.</strong>Add your first transaction to start the ledger.</div>`;
}
function sum(list){ return list.reduce((a,t)=>a+Number(t.amount),0); }

/* ---------------- transactions section ---------------- */
function renderTransactions(){
  fillFilterCategories();
  const q = document.getElementById('searchInput').value.toLowerCase();
  const fc = document.getElementById('filterCategory').value;
  const ft = document.getElementById('filterType').value;
  const order = document.getElementById('sortOrder').value;

  let list = state.transactions.filter(t=>{
    if(fc!=='all' && t.category!==fc) return false;
    if(ft!=='all' && t.type!==ft) return false;
    if(q && !(t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))) return false;
    return true;
  });

  list.sort((a,b)=>{
    if(order==='newest') return new Date(b.date)-new Date(a.date);
    if(order==='oldest') return new Date(a.date)-new Date(b.date);
    if(order==='highest') return b.amount-a.amount;
    if(order==='lowest') return a.amount-b.amount;
  });

  const box = document.getElementById('txList');
  box.innerHTML = list.length ? list.map(ledgerRow).join('') :
    `<div class="empty"><strong>Nothing matches.</strong>Try clearing your search or filters — or add a new entry above.</div>`;
}

/* ---------------- analytics ---------------- */
function renderTrendChart(){
  const box = document.getElementById('trendChart');
  if(!state.transactions.length){
    box.innerHTML = `<div class="trend-empty">No entries yet — your monthly trend will show up here once you start logging.</div>`;
    return;
  }

  const byMonth = {};
  state.transactions.forEach(t=>{
    const key = t.date.slice(0,7); // "YYYY-MM"
    if(!byMonth[key]) byMonth[key] = {income:0, expense:0};
    byMonth[key][t.type] += Number(t.amount);
  });

  const months = Object.keys(byMonth).sort().slice(-6);
  const max = Math.max(1, ...months.map(m => Math.max(byMonth[m].income, byMonth[m].expense)));

  const monthLabel = (key)=>{
    const [y,m] = key.split('-');
    const d = new Date(Number(y), Number(m)-1, 1);
    return d.toLocaleDateString('en-GB', {month:'short'});
  };

  box.innerHTML = `<div class="trend-chart">` + months.map(key=>{
    const {income, expense} = byMonth[key];
    const incH = Math.max(2, (income/max*150));
    const expH = Math.max(2, (expense/max*150));
    return `
    <div class="trend-month">
      <div class="trend-bars">
        <div class="trend-bar income" style="height:${incH}px" title="Income: ${cur()}${fmt(income)}"></div>
        <div class="trend-bar expense" style="height:${expH}px" title="Expenses: ${cur()}${fmt(expense)}"></div>
      </div>
      <div class="trend-label">${monthLabel(key)}</div>
    </div>`;
  }).join('') + `</div>`;
}

function renderAnalytics(){
  renderTrendChart();

  // "This month" snapshot — filtered to the current calendar month, not all-time
  const nowKey = todayISO().slice(0,7);
  const thisMonth = state.transactions.filter(t=>t.date.slice(0,7)===nowKey);
  const expenses = thisMonth.filter(t=>t.type==='expense');
  const income = sum(thisMonth.filter(t=>t.type==='income'));
  const expTotal = sum(expenses);
  document.getElementById('anIncome').textContent = cur()+fmt(income);
  document.getElementById('anExpense').textContent = cur()+fmt(expTotal);
  document.getElementById('anNet').textContent = cur()+fmt(income-expTotal);

  const byCat = {};
  expenses.forEach(t=> byCat[t.category] = (byCat[t.category]||0) + Number(t.amount));
  const rows = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const max = rows.length ? rows[0][1] : 1;

  const box = document.getElementById('analyticsBars');
  box.innerHTML = rows.length ? rows.map(([name,amt])=>`
    <div class="bar-row">
      <div class="bar-top"><span class="cat-name">${name}</span><span class="cat-amt mono">${cur()}${fmt(amt)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(amt/max*100).toFixed(1)}%"></div></div>
    </div>`).join('') :
    `<div class="empty"><strong>No spending logged this month.</strong>Once you add expenses, their breakdown shows up here.</div>`;
}

/* ---------------- budgets ---------------- */
function openBudgetForm(){
  document.getElementById('budgetPanel').classList.add('open');
  fillCategorySelect(document.getElementById('budgetCategory'), 'expense');
}
function closeBudgetForm(){
  document.getElementById('budgetPanel').classList.remove('open');
  document.getElementById('budgetAmount').value='';
}
function submitBudget(){
  const category = document.getElementById('budgetCategory').value;
  const amount = parseFloat(document.getElementById('budgetAmount').value);
  if(!amount || amount<=0){ alert('Enter a limit greater than zero.'); return; }
  const existing = state.budgets.find(b=>b.category===category);
  if(existing) existing.amount = amount;
  else state.budgets.push({ id:uid(), category, amount });
  persist();
  closeBudgetForm();
  renderAll();
}
function deleteBudget(id){
  const idx = state.budgets.findIndex(b=>b.id===id);
  if(idx===-1) return;
  const [removed] = state.budgets.splice(idx,1);
  persist();
  renderAll();
  showUndoToast('Budget removed', () => {
    state.budgets.splice(idx,0,removed);
    persist();
    renderAll();
  });
}
function renderBudgets(){
  const box = document.getElementById('budgetList');
  if(!state.budgets.length){
    box.innerHTML = `<div class="empty"><strong>No budgets set.</strong>Set a monthly limit per category to track how close you are.</div>`;
    return;
  }
  box.innerHTML = state.budgets.map(b=>{
    const nowKey = todayISO().slice(0,7);
    const spent = sum(state.transactions.filter(t=>t.type==='expense' && t.category===b.category && t.date.slice(0,7)===nowKey));
    const pct = Math.min(100, (spent/b.amount*100));
    const over = spent > b.amount;
    return `
    <div class="item-row">
      <div class="item-top">
        <div class="item-name">${b.category}</div>
        <div class="item-nums mono">${cur()}${fmt(spent)} <span style="color:var(--ink-faint)">of</span> ${cur()}${fmt(b.amount)}</div>
      </div>
      <div class="progress-track"><div class="progress-fill ${over?'over':''}" style="width:${pct}%"></div></div>
      ${over ? `<div class="item-sub" style="color:var(--expense);">Over budget by ${cur()}${fmt(spent-b.amount)}</div>` : ''}
      <div class="item-actions"><button onclick="deleteBudget('${b.id}')">Remove budget</button></div>
    </div>`;
  }).join('');
}

/* ---------------- goals ---------------- */
function openGoalForm(){ document.getElementById('goalPanel').classList.add('open'); }
function closeGoalForm(){
  document.getElementById('goalPanel').classList.remove('open');
  ['goalName','goalTarget','goalSaved'].forEach(id=>document.getElementById(id).value='');
}
function submitGoal(){
  const name = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const saved = parseFloat(document.getElementById('goalSaved').value) || 0;
  if(!name){ alert('Give this goal a name.'); return; }
  if(!target || target<=0){ alert('Enter a target greater than zero.'); return; }
  state.goals.push({ id:uid(), name, target, saved });
  persist();
  closeGoalForm();
  renderAll();
}
function deleteGoal(id){
  const idx = state.goals.findIndex(g=>g.id===id);
  if(idx===-1) return;
  const [removed] = state.goals.splice(idx,1);
  persist();
  renderAll();
  showUndoToast('Goal removed', () => {
    state.goals.splice(idx,0,removed);
    persist();
    renderAll();
  });
}
function addToGoal(id){
  const g = state.goals.find(g=>g.id===id);
  const amt = parseFloat(prompt(`Add how much to "${g.name}"?`, '0'));
  if(!amt || amt<=0) return;
  g.saved += amt;
  persist(); renderAll();
}
function renderGoals(){
  const box = document.getElementById('goalList');
  if(!state.goals.length){
    box.innerHTML = `<div class="empty"><strong>No goals yet.</strong>Name something you're saving toward and track your progress here.</div>`;
    return;
  }
  box.innerHTML = state.goals.map(g=>{
    const pct = Math.min(100, (g.saved/g.target*100));
    const done = g.saved >= g.target;
    return `
    <div class="item-row">
      <div class="item-top">
        <div>
          <div class="item-name">${escapeHTML(g.name)}</div>
          ${done ? `<div class="item-sub" style="color:var(--income);">Goal reached</div>` : ''}
        </div>
        <div class="item-nums mono">${cur()}${fmt(g.saved)} <span style="color:var(--ink-faint)">of</span> ${cur()}${fmt(g.target)}</div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="item-actions">
        <button onclick="addToGoal('${g.id}')">Add funds</button>
        <button onclick="deleteGoal('${g.id}')">Remove goal</button>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- settings ---------------- */
const CUR_OPTIONS = ['₦','$','€','£'];
function renderSettings(){
  const box = document.getElementById('currencyOptions');
  box.innerHTML = CUR_OPTIONS.map(c=>`<button class="cur-opt ${c===state.currency?'active':''}" onclick="setCurrency('${c}')">${c}</button>`).join('');
}
function setCurrency(c){ state.currency = c; persist(); renderAll(); }
function resetAll(){
  if(!confirm('Clear every transaction, budget, and goal? This cannot be undone.')) return;
  state.transactions = []; state.budgets = []; state.goals = [];
  persist(); renderAll();
}

/* ---------------- render all ---------------- */
function renderAll(){
  renderDashboard();
  renderTransactions();
  renderAnalytics();
  renderBudgets();
  renderGoals();
  renderSettings();
}
renderAll();
