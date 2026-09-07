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

/* ---------------- transaction form ---------------- */
let currentType = 'expense';
document.getElementById('typeToggle').addEventListener('click', e=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeToggle button').forEach(b=>b.classList.toggle('on', b===btn));
  fillCategorySelect(document.getElementById('txCategory'), currentType);
});
function openForm(){
  document.getElementById('txPanel').classList.add('open');
  document.getElementById('txDate').value = todayISO();
  fillCategorySelect(document.getElementById('txCategory'), currentType);
}
function closeForm(){
  document.getElementById('txPanel').classList.remove('open');
  document.getElementById('txAmount').value='';
  document.getElementById('txDesc').value='';
}
function submitTransaction(){
  const amount = parseFloat(document.getElementById('txAmount').value);
  const desc = document.getElementById('txDesc').value.trim();
  const category = document.getElementById('txCategory').value;
  const date = document.getElementById('txDate').value || todayISO();
  if(!amount || amount<=0){ alert('Enter an amount greater than zero.'); return; }
  if(!desc){ alert('Give this entry a short description.'); return; }
  state.transactions.push({ id:uid(), type:currentType, amount, category, desc, date });
  persist();
  closeForm();
  renderAll();
}
function deleteTransaction(id){
  state.transactions = state.transactions.filter(t=>t.id!==id);
  persist();
  renderAll();
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
    <button class="l-del btn-danger-text" onclick="deleteTransaction('${t.id}')" aria-label="Delete entry">✕</button>
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
function renderAnalytics(){
  const expenses = state.transactions.filter(t=>t.type==='expense');
  const income = sum(state.transactions.filter(t=>t.type==='income'));
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
    `<div class="empty"><strong>No spending logged yet.</strong>Once you add expenses, their breakdown shows up here.</div>`;
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
  state.budgets = state.budgets.filter(b=>b.id!==id);
  persist(); renderAll();
}
function renderBudgets(){
  const box = document.getElementById('budgetList');
  if(!state.budgets.length){
    box.innerHTML = `<div class="empty"><strong>No budgets set.</strong>Set a monthly limit per category to track how close you are.</div>`;
    return;
  }
  box.innerHTML = state.budgets.map(b=>{
    const spent = sum(state.transactions.filter(t=>t.type==='expense' && t.category===b.category));
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
function deleteGoal(id){ state.goals = state.goals.filter(g=>g.id!==id); persist(); renderAll(); }
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
