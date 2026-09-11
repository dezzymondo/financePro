/* ---------------- account and state ---------------- */
const CATEGORIES = {
  expense: ['Food','Transport','Housing','Utilities','Entertainment','Health','Shopping','Other'],
  income: ['Salary','Freelance','Gift','Other']
};

const DATA_FIELDS = ['transactions','budgets','goals','templates','recurring','accounts','customCategories'];
let currentUser = null;
let authMode = 'login';
let state = createEmptyState();

function createEmptyState(){
  return {
    transactions:[], budgets:[], goals:[], templates:[], recurring:[],
    accounts:[{id:'cash', name:'Cash'}],
    customCategories:{expense:[], income:[]},
    currency:'₦'
  };
}
function normalizeState(value){
  const base = createEmptyState();
  const next = {...base, ...(value || {})};
  next.transactions = Array.isArray(next.transactions) ? next.transactions.map(t=>({
    ...t, accountId:t.accountId || 'cash', notes:t.notes || '', receipt:t.receipt || ''
  })) : [];
  next.budgets = Array.isArray(next.budgets) ? next.budgets : [];
  next.goals = Array.isArray(next.goals) ? next.goals : [];
  next.templates = Array.isArray(next.templates) ? next.templates : [];
  next.recurring = Array.isArray(next.recurring) ? next.recurring.map(r=>({
    ...r, accountId:r.accountId || 'cash', notes:r.notes || '', receipt:r.receipt || ''
  })) : [];
  next.accounts = Array.isArray(next.accounts) && next.accounts.length ? next.accounts : base.accounts;
  const accountIds = new Set(next.accounts.map(a=>a.id));
  const fallbackAccount = next.accounts[0].id;
  next.transactions = next.transactions.map(t=>accountIds.has(t.accountId) ? t : {...t, accountId:fallbackAccount});
  next.recurring = next.recurring.map(r=>accountIds.has(r.accountId) ? r : {...r, accountId:fallbackAccount});
  next.customCategories = {
    expense:Array.isArray(next.customCategories?.expense) ? next.customCategories.expense : [],
    income:Array.isArray(next.customCategories?.income) ? next.customCategories.income : []
  };
  return next;
}
function userDoc(){ return financeDb.collection('users').doc(currentUser.uid); }
function loadLocalState(){
  state = createEmptyState();
  DATA_FIELDS.forEach(field=>{
    const stored = localStorage.getItem(`fp_${field}`);
    if(stored !== null){
      try { state[field] = JSON.parse(stored); } catch { state[field] = []; }
    }
  });
  state.currency = localStorage.getItem('fp_currency') || '₦';
  state = normalizeState(state);
}

function persist(){
  if(!currentUser) return;
  const data = {...state, updatedAt: firebase.firestore.FieldValue.serverTimestamp()};
  userDoc().set(data, {merge:true}).catch(error=>setAuthError(`Could not save your data: ${error.message}`));
}

function fmt(n){
  return Number(n||0).toLocaleString('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function cur(){ return state.currency; }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function normalizeEmail(value){ return value.trim().toLowerCase(); }
function setAuthError(message){ document.getElementById('authError').textContent = message; }
function setAuthMode(mode){
  authMode = mode;
  const signup = mode === 'signup';
  document.getElementById('authTitle').textContent = signup ? 'Create your ledger.' : 'Welcome back.';
  document.getElementById('authIntro').textContent = signup ? 'Start a private ledger on this device.' : 'Log in to pick up where you left off.';
  document.getElementById('authSubmit').textContent = signup ? 'Create account' : 'Log in';
  document.getElementById('authConfirmField').style.display = signup ? 'block' : 'none';
  document.getElementById('authConfirm').required = signup;
  document.getElementById('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
  document.getElementById('loginTab').classList.toggle('active', !signup);
  document.getElementById('signupTab').classList.toggle('active', signup);
  document.getElementById('forgotPasswordBtn').style.display = signup ? 'none' : 'block';
  setAuthError('');
}
async function handleAuthSubmit(event){
  event.preventDefault();
  const email = normalizeEmail(document.getElementById('authEmail').value);
  const password = document.getElementById('authPassword').value;
  setAuthError('');
  try {
    if(authMode === 'signup'){
      if(password !== document.getElementById('authConfirm').value){ setAuthError('Passwords do not match.'); return; }
      await financeAuth.createUserWithEmailAndPassword(email, password);
    } else {
      await financeAuth.signInWithEmailAndPassword(email, password);
    }
  } catch(error){
    setAuthError(firebaseAuthMessage(error));
  }
}
function firebaseAuthMessage(error){
  const messages = {
    'auth/invalid-credential':'Email or password is incorrect.',
    'auth/invalid-email':'Enter a valid email address.',
    'auth/user-not-found':'No account was found for that email.',
    'auth/email-already-in-use':'An account with that email already exists.',
    'auth/weak-password':'Use a password with at least 6 characters.',
    'auth/popup-closed-by-user':'Google sign-in was cancelled.',
    'auth/operation-not-allowed':'This sign-in method is disabled. Enable it in Firebase Console → Authentication → Sign-in providers.',
    'auth/unauthorized-domain':'This website is not authorized. Add financepro-4299f.web.app under Firebase Authentication → Settings → Authorized domains.',
    'auth/network-request-failed':'Network error. Check your internet connection and try again.',
    'auth/too-many-requests':'Too many attempts. Wait a few minutes and try again.'
  };
  return messages[error.code] || `Authentication failed (${error.code || 'unknown error'}). Please try again.`;
}
async function signInWithGoogle(){
  setAuthError('');
  try { await financeAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  catch(error){ setAuthError(firebaseAuthMessage(error)); }
}
async function sendPasswordReset(){
  const email = normalizeEmail(document.getElementById('authEmail').value);
  if(!email){ setAuthError('Enter your email address first.'); return; }
  try {
    await financeAuth.sendPasswordResetEmail(email);
    setAuthError('Password reset email sent. Check your inbox.');
  } catch(error){ setAuthError(firebaseAuthMessage(error)); }
}
async function startSession(user){
  currentUser = user;
  const snapshot = await userDoc().get();
  if(snapshot.exists){ state = normalizeState(snapshot.data()); }
  else { loadLocalState(); persist(); }
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('accountEmail').textContent = user.email || 'Google account';
  document.body.classList.remove('auth-locked');
  generateDueRecurring();
  renderAll();
  showWelcomeIfNeeded();
  showSecuritySetupIfNeeded();
}
function signOut(){
  financeAuth.signOut();
}
function bootAuth(){
  financeAuth.onAuthStateChanged(user=>{
    if(user) startSession(user);
    else {
      currentUser = null;
      state = createEmptyState();
      document.getElementById('welcomeOverlay').classList.remove('show');
      document.getElementById('pinOverlay').classList.remove('show');
      document.getElementById('securitySetupOverlay').classList.remove('show');
      document.getElementById('authGate').style.display = 'flex';
      document.getElementById('authForm').reset();
      setAuthMode('login');
    }
  });
}

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

/* ---------------- welcome modal (first visit) ---------------- */
function showWelcomeIfNeeded(){
  if(currentUser && !localStorage.getItem(`fp_seenWelcome_${currentUser.uid}`)){
    document.getElementById('welcomeOverlay').classList.add('show');
  }
}
function dismissWelcome(){
  localStorage.setItem(`fp_seenWelcome_${currentUser.uid}`, '1');
  document.getElementById('welcomeOverlay').classList.remove('show');
  showSecuritySetupIfNeeded();
}

function showSecuritySetupIfNeeded(){
  if(!currentUser || localStorage.getItem(`fp_seenSecurity_${currentUser.uid}`)) return;
  if(document.getElementById('welcomeOverlay').classList.contains('show')) return;
  document.getElementById('securitySetupOverlay').classList.add('show');
  updateBiometricButtons();
}
function skipSecuritySetup(){
  localStorage.setItem(`fp_seenSecurity_${currentUser.uid}`, '1');
  document.getElementById('securitySetupOverlay').classList.remove('show');
}

/* ---------------- section info toggles ---------------- */
function toggleInfo(id){
  const panel = document.getElementById(id);
  if(panel) panel.classList.toggle('open');
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
  const categories = [...new Set([...CATEGORIES[type], ...state.customCategories[type]])];
  sel.innerHTML = categories.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
}
function fillAccountSelect(sel){
  sel.innerHTML = state.accounts.map(a=>`<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('');
  if(!sel.value && state.accounts[0]) sel.value = state.accounts[0].id;
}
function fillFilterCategories(){
  const all = [...new Set([...state.transactions.map(t=>t.category), ...CATEGORIES.expense, ...CATEGORIES.income, ...state.customCategories.expense, ...state.customCategories.income])].sort();
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
  document.getElementById('txNotes').value = '';
  document.getElementById('txReceipt').value = '';
  document.getElementById('txDate').value = todayISO();
  document.getElementById('txSaveTemplate').checked = false;
  document.getElementById('txRecurring').checked = false;
  document.getElementById('txExtrasRow').style.display = 'flex';
  document.querySelectorAll('#typeToggle button').forEach(b=>b.classList.toggle('on', b.dataset.type==='expense'));
  fillCategorySelect(document.getElementById('txCategory'), currentType);
  fillAccountSelect(document.getElementById('txAccount'));
}

function editTransaction(id){
  const t = state.transactions.find(x=>x.id===id);
  if(!t) return;
  editingId = id;
  currentType = t.type;
  document.getElementById('txPanelTitle').textContent = 'Edit entry';
  document.getElementById('txSaveBtn').textContent = 'Save changes';
  document.getElementById('txPanel').classList.add('open');
  document.getElementById('txExtrasRow').style.display = 'none'; // template/recurring only apply when creating new
  document.querySelectorAll('#typeToggle button').forEach(b=>b.classList.toggle('on', b.dataset.type===t.type));
  fillCategorySelect(document.getElementById('txCategory'), t.type);
  document.getElementById('txCategory').value = t.category;
  document.getElementById('txAmount').value = t.amount;
  document.getElementById('txDesc').value = t.desc;
  document.getElementById('txNotes').value = t.notes || '';
  document.getElementById('txReceipt').value = t.receipt || '';
  document.getElementById('txDate').value = t.date;
  fillAccountSelect(document.getElementById('txAccount'));
  document.getElementById('txAccount').value = t.accountId || 'cash';
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
  const accountId = document.getElementById('txAccount').value || 'cash';
  const notes = document.getElementById('txNotes').value.trim();
  const receipt = document.getElementById('txReceipt').value.trim();
  const date = document.getElementById('txDate').value || todayISO();
  if(!amount || amount<=0){ alert('Enter an amount greater than zero.'); return; }
  if(!desc){ alert('Give this entry a short description.'); return; }

  if(editingId){
    const t = state.transactions.find(x=>x.id===editingId);
    if(t){ t.type = currentType; t.amount = amount; t.category = category; t.accountId = accountId; t.notes = notes; t.receipt = receipt; t.desc = desc; t.date = date; }
  } else {
    state.transactions.push({ id:uid(), type:currentType, amount, category, accountId, notes, receipt, desc, date });

    if(document.getElementById('txSaveTemplate').checked){
      const dup = state.templates.find(tp => tp.type===currentType && tp.category===category && tp.desc.toLowerCase()===desc.toLowerCase() && Number(tp.amount)===amount);
      if(!dup) state.templates.push({ id:uid(), type:currentType, amount, category, desc });
    }
    if(document.getElementById('txRecurring').checked){
      state.recurring.push({
        id:uid(), type:currentType, amount, category, accountId, notes, receipt, desc,
        dayOfMonth: Number(date.slice(8,10)),
        lastGeneratedMonth: date.slice(0,7) // this instance already covers its own month
      });
    }
  }
  persist();
  closeForm();
  renderAll();
}

/* ---------------- quick-add templates ---------------- */
function useTemplate(id){
  const tpl = state.templates.find(t=>t.id===id);
  if(!tpl) return;
  state.transactions.push({ id:uid(), type:tpl.type, amount:tpl.amount, category:tpl.category, accountId:tpl.accountId || 'cash', notes:tpl.notes || '', receipt:tpl.receipt || '', desc:tpl.desc, date:todayISO() });
  persist();
  renderAll();
  showUndoToast(`Added: ${tpl.desc}`, () => {
    state.transactions.pop();
    persist();
    renderAll();
  });
}
function deleteTemplate(id, ev){
  if(ev) ev.stopPropagation();
  state.templates = state.templates.filter(t=>t.id!==id);
  persist();
  renderAll();
}
function renderQuickAdd(){
  const wrap = document.getElementById('quickAddWrap');
  const box = document.getElementById('quickAddChips');
  if(!state.templates.length){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  box.innerHTML = state.templates.map(t=>`
    <div class="quickadd-chip" onclick="useTemplate('${t.id}')">
      <span>${escapeHTML(t.desc)} · ${cur()}${fmt(t.amount)}</span>
      <button class="qa-remove" onclick="deleteTemplate('${t.id}', event)" aria-label="Remove template">✕</button>
    </div>`).join('');
}

/* ---------------- recurring transactions ---------------- */
function generateDueRecurring(){
  const nowKey = todayISO().slice(0,7);
  let changed = false;
  state.recurring.forEach(r=>{
    if(r.lastGeneratedMonth < nowKey){
      const [y,m] = nowKey.split('-');
      const daysInMonth = new Date(Number(y), Number(m), 0).getDate();
      const day = Math.min(r.dayOfMonth, daysInMonth);
      const dateStr = `${nowKey}-${String(day).padStart(2,'0')}`;
      state.transactions.push({ id:uid(), type:r.type, amount:r.amount, category:r.category, accountId:r.accountId || 'cash', notes:r.notes || '', receipt:r.receipt || '', desc:r.desc, date:dateStr });
      r.lastGeneratedMonth = nowKey;
      changed = true;
    }
  });
  if(changed) persist();
}
function stopRecurring(id){
  state.recurring = state.recurring.filter(r=>r.id!==id);
  persist();
  renderAll();
}
function renderRecurring(){
  const wrap = document.getElementById('recurringWrap');
  const box = document.getElementById('recurringList');
  if(!state.recurring.length){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  box.innerHTML = state.recurring.map(r=>`
    <div class="recurring-row">
      <div>
        <div class="rr-info">${escapeHTML(r.desc)} — ${cur()}${fmt(r.amount)}</div>
        <div class="rr-sub">${r.category} · ${escapeHTML(accountName(r.accountId))} · logs on day ${r.dayOfMonth} of each month${recurringReminder(r) ? ` · <span class="reminder">${recurringReminder(r)}</span>` : ''}</div>
      </div>
      <button onclick="stopRecurring('${r.id}')">Stop repeating</button>
    </div>`).join('');
}
function recurringReminder(rule){
  const now = new Date();
  const day = Math.min(rule.dayOfMonth, new Date(now.getFullYear(), now.getMonth()+1, 0).getDate());
  const due = new Date(now.getFullYear(), now.getMonth(), day);
  const days = Math.ceil((due - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  return days >= 0 && days <= 3 ? (days === 0 ? 'due today' : `due in ${days} day${days===1?'':'s'}`) : '';
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
      <div class="l-meta"><span class="cat">${escapeHTML(t.category)}</span> · ${escapeHTML(accountName(t.accountId))} · ${formatDate(t.date)}${t.notes ? ` · ${escapeHTML(t.notes)}` : ''}${t.receipt ? ` · <a class="receipt-link" href="${escapeHTML(t.receipt)}" target="_blank" rel="noopener">receipt</a>` : ''}</div>
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
  renderHealth();
}
function sum(list){ return list.reduce((a,t)=>a+Number(t.amount),0); }
function accountName(id){ return state.accounts.find(a=>a.id===id)?.name || 'Cash'; }
function renderHealth(){
  const month = todayISO().slice(0,7);
  const rows = state.transactions.filter(t=>t.date.slice(0,7)===month);
  const income = sum(rows.filter(t=>t.type==='income'));
  const expenses = sum(rows.filter(t=>t.type==='expense'));
  const budgetTotal = state.budgets.reduce((total,b)=>total+Number(b.amount),0);
  const saved = income-expenses;
  document.getElementById('healthPeriod').textContent = new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  document.getElementById('healthGrid').innerHTML = [
    ['Net this month', `${cur()}${fmt(saved)}`, saved >= 0 ? 'positive' : 'negative'],
    ['Savings rate', income ? `${Math.round(saved/income*100)}%` : '—', saved >= 0 ? 'positive' : 'negative'],
    ['Budget used', budgetTotal ? `${Math.round(expenses/budgetTotal*100)}%` : '—', budgetTotal && expenses > budgetTotal ? 'negative' : 'positive'],
    ['Goals in progress', `${state.goals.filter(g=>g.saved < g.target).length}`, 'neutral']
  ].map(([label,value,kind])=>`<div class="health-card ${kind}"><span>${label}</span><strong class="mono">${value}</strong></div>`).join('');
}

/* ---------------- transactions section ---------------- */
function renderTransactions(){
  fillFilterCategories();
  const accountFilter = document.getElementById('filterAccount');
  const currentAccount = accountFilter.value;
  accountFilter.innerHTML = '<option value="all">All accounts</option>' + state.accounts.map(a=>`<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('');
  if([...accountFilter.options].some(o=>o.value===currentAccount)) accountFilter.value = currentAccount;
  const q = document.getElementById('searchInput').value.toLowerCase();
  const fc = document.getElementById('filterCategory').value;
  const ft = document.getElementById('filterType').value;
  const order = document.getElementById('sortOrder').value;

  let list = state.transactions.filter(t=>{
    if(fc!=='all' && t.category!==fc) return false;
    if(accountFilter.value!=='all' && (t.accountId || 'cash')!==accountFilter.value) return false;
    if(ft!=='all' && t.type!==ft) return false;
    if(q && !(t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q))) return false;
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
  renderYearReport();

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

function renderYearReport(){
  const select = document.getElementById('reportYear');
  const years = [...new Set([todayISO().slice(0,4), ...state.transactions.map(t=>t.date.slice(0,4))])].sort().reverse();
  const current = select.value || years[0];
  select.innerHTML = years.map(year=>`<option value="${year}">${year}</option>`).join('');
  select.value = years.includes(current) ? current : years[0];
  const rows = state.transactions.filter(t=>t.date.startsWith(select.value));
  const income = sum(rows.filter(t=>t.type==='income'));
  const expense = sum(rows.filter(t=>t.type==='expense'));
  const byMonth = Array.from({length:12},(_,index)=>{
    const key = `${select.value}-${String(index+1).padStart(2,'0')}`;
    const monthRows = rows.filter(t=>t.date.startsWith(key));
    return {label:new Date(Number(select.value),index,1).toLocaleDateString('en-GB',{month:'short'}), income:sum(monthRows.filter(t=>t.type==='income')), expense:sum(monthRows.filter(t=>t.type==='expense'))};
  });
  document.getElementById('yearReport').innerHTML = `
    <div class="report-summary"><span>Income <strong class="mono">${cur()}${fmt(income)}</strong></span><span>Expenses <strong class="mono">${cur()}${fmt(expense)}</strong></span><span>Net <strong class="mono">${cur()}${fmt(income-expense)}</strong></span></div>
    <div class="year-bars">${byMonth.map(m=>`<div class="year-month"><div class="year-bar-pair"><i class="income" style="height:${Math.max(2,Math.min(100,m.income/(Math.max(income,expense,1)/12)*100))}px"></i><i class="expense" style="height:${Math.max(2,Math.min(100,m.expense/(Math.max(income,expense,1)/12)*100))}px"></i></div><small>${m.label}</small></div>`).join('')}</div>`;
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
  document.getElementById('accountList').innerHTML = state.accounts.map(a=>`<div class="manage-row"><span>${escapeHTML(a.name)}</span>${state.accounts.length > 1 ? `<button onclick="removeAccount('${a.id}')">Remove</button>` : ''}</div>`).join('');
  document.getElementById('categoryList').innerHTML = ['expense','income'].map(type=>state.customCategories[type].map(name=>`<div class="manage-row"><span>${escapeHTML(name)} <small>${type}</small></span><button onclick="removeCategory('${type}','${encodeURIComponent(name)}')">Remove</button></div>`).join('')).join('') || '<div class="empty compact">No custom categories yet.</div>';
}
function setCurrency(c){ state.currency = c; persist(); renderAll(); }
function addAccount(){
  const input = document.getElementById('accountName');
  const name = input.value.trim();
  if(!name) return setSettingsStatus('Enter an account name first.', true);
  if(state.accounts.some(a=>a.name.toLowerCase()===name.toLowerCase())) return setSettingsStatus('That account already exists.', true);
  state.accounts.push({id:uid(), name}); input.value=''; persist(); renderAll(); setSettingsStatus(`Added ${name}.`);
}
function removeAccount(id){
  if(state.accounts.length===1) return;
  if(state.transactions.some(t=>(t.accountId||'cash')===id) && !confirm('Transactions use this account. Remove the account anyway?')) return;
  state.accounts = state.accounts.filter(a=>a.id!==id); persist(); renderAll();
}
function addCategory(){
  const type = document.getElementById('newCategoryType').value;
  const input = document.getElementById('categoryName');
  const name = input.value.trim();
  if(!name) return setSettingsStatus('Enter a category name first.', true);
  if([...CATEGORIES[type],...state.customCategories[type]].some(c=>c.toLowerCase()===name.toLowerCase())) return setSettingsStatus('That category already exists.', true);
  state.customCategories[type].push(name); input.value=''; persist(); renderAll(); setSettingsStatus(`Added ${name}.`);
}
function removeCategory(type,name){
  state.customCategories[type] = state.customCategories[type].filter(c=>c!==decodeURIComponent(name)); persist(); renderAll();
}
function resetAll(){
  if(!confirm('Clear every transaction, budget, goal, and template? This cannot be undone.')) return;
  state.transactions = []; state.budgets = []; state.goals = []; state.templates = []; state.recurring = [];
  state.accounts = [{id:'cash', name:'Cash'}]; state.customCategories = {expense:[], income:[]};
  persist(); renderAll();
}

function savePin(){
  const pin = document.getElementById('pinValue').value.trim();
  if(!/^\d{4,6}$/.test(pin)) return setSettingsStatus('Use a 4–6 digit PIN.', true);
  localStorage.setItem(`fp_pin_${currentUser.uid}`, pin);
  document.getElementById('pinValue').value='';
  setSettingsStatus('PIN saved. Use Lock now when you want to lock the app.');
}
function removePin(){
  localStorage.removeItem(`fp_pin_${currentUser.uid}`);
  document.getElementById('pinValue').value='';
  document.getElementById('pinOverlay').classList.remove('show');
  setSettingsStatus('PIN removed.');
}
function shouldLock(){ return Boolean(currentUser && localStorage.getItem(`fp_pin_${currentUser.uid}`)); }
function lockApp(){
  if(!shouldLock()) return setSettingsStatus('Set a PIN first, then lock the app.', true);
  document.getElementById('unlockPin').value='';
  document.getElementById('pinError').textContent='';
  document.getElementById('pinOverlay').classList.add('show');
}
function setSecurityPin(){
  const pin = document.getElementById('setupPin').value.trim();
  const confirmPin = document.getElementById('setupPinConfirm').value.trim();
  const error = document.getElementById('securitySetupError');
  if(!/^\d{4,6}$/.test(pin)){ error.textContent='Use a 4–6 digit PIN.'; return; }
  if(pin !== confirmPin){ error.textContent='The PINs do not match.'; return; }
  localStorage.setItem(`fp_pin_${currentUser.uid}`, pin);
  localStorage.setItem(`fp_seenSecurity_${currentUser.uid}`, '1');
  document.getElementById('securitySetupOverlay').classList.remove('show');
}
function updateBiometricButtons(){
  const supported = window.PublicKeyCredential && navigator.credentials;
  document.querySelectorAll('#biometricUnlockBtn, #securitySetupOverlay button[onclick="setupBiometric()"]')
    .forEach(button=>button.style.display = supported ? 'block' : 'none');
}
function randomBytes(size){
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}
function toBase64Url(bytes){
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromBase64Url(value){
  const padded = value.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((value.length+3)%4);
  return Uint8Array.from(atob(padded), char=>char.charCodeAt(0));
}
async function setupBiometric(){
  const error = document.getElementById('securitySetupError');
  if(!window.PublicKeyCredential || !navigator.credentials){ error.textContent='Biometrics are not supported in this browser.'; return; }
  try {
    const credential = await navigator.credentials.create({publicKey:{
      challenge:randomBytes(32),
      rp:{name:'FinancePro', id:location.hostname},
      user:{id:randomBytes(16), name:currentUser.email || currentUser.uid, displayName:'FinancePro user'},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},
      timeout:60000,
      attestation:'none'
    }});
    localStorage.setItem(`fp_biometric_${currentUser.uid}`, toBase64Url(credential.rawId));
    localStorage.setItem(`fp_seenSecurity_${currentUser.uid}`, '1');
    document.getElementById('securitySetupOverlay').classList.remove('show');
  } catch(errorObject){ error.textContent = errorObject.name === 'NotAllowedError' ? 'Biometric setup was cancelled.' : 'Biometric setup is unavailable on this device.'; }
}
async function unlockWithBiometric(){
  const credentialId = localStorage.getItem(`fp_biometric_${currentUser.uid}`);
  if(!credentialId) return;
  try {
    await navigator.credentials.get({publicKey:{challenge:randomBytes(32), allowCredentials:[{type:'public-key',id:fromBase64Url(credentialId)}], userVerification:'required', timeout:60000}});
    document.getElementById('pinOverlay').classList.remove('show');
  } catch(errorObject){ document.getElementById('pinError').textContent = errorObject.name === 'NotAllowedError' ? 'Biometric unlock was cancelled.' : 'Biometric unlock failed.'; }
}
function setSettingsStatus(message, isError=false){
  const status = document.getElementById('pinStatus');
  if(status){ status.textContent = message; status.classList.toggle('error', isError); }
}
function unlockApp(){
  const expected = localStorage.getItem(`fp_pin_${currentUser.uid}`);
  const entered = document.getElementById('unlockPin').value;
  if(entered !== expected){ document.getElementById('pinError').textContent='That PIN is incorrect.'; return; }
  document.getElementById('unlockPin').value='';
  document.getElementById('pinError').textContent='';
  document.getElementById('pinOverlay').classList.remove('show');
}

/* ---------------- backup and CSV export ---------------- */
function downloadFile(content, filename, type){
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function exportBackup(){
  const backup = {
    app: 'FinancePro',
    version: 1,
    exportedAt: new Date().toISOString(),
    currency: state.currency,
    transactions: state.transactions,
    budgets: state.budgets,
    goals: state.goals,
    templates: state.templates,
    recurring: state.recurring,
    accounts: state.accounts,
    customCategories: state.customCategories
  };
  downloadFile(JSON.stringify(backup, null, 2), `financepro-backup-${todayISO()}.json`, 'application/json');
}
function importBackup(event){
  const file = event.target.files[0];
  event.target.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      const valid = backup && backup.app === 'FinancePro' &&
        Array.isArray(backup.transactions) && Array.isArray(backup.budgets) &&
        Array.isArray(backup.goals) && Array.isArray(backup.templates) &&
        Array.isArray(backup.recurring);
      if(!valid) throw new Error('This is not a valid FinancePro backup.');
      if(!confirm('Restore this backup? Your current ledger will be replaced.')) return;
      state = normalizeState({
        currency: CUR_OPTIONS.includes(backup.currency) ? backup.currency : '₦',
        transactions: backup.transactions,
        budgets: backup.budgets,
        goals: backup.goals,
        templates: backup.templates,
        recurring: backup.recurring,
        accounts: backup.accounts,
        customCategories: backup.customCategories
      });
      persist();
      renderAll();
      alert('Backup restored successfully.');
    } catch(error){
      alert(error.message || 'Could not read this backup file.');
    }
  };
  reader.readAsText(file);
}
function parseCSVLine(line){
  const values=[]; let value=''; let quoted=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(char==='"' && line[i+1]==='"' && quoted){ value+='"'; i++; }
    else if(char==='"'){ quoted=!quoted; }
    else if(char===',' && !quoted){ values.push(value.trim()); value=''; }
    else value+=char;
  }
  values.push(value.trim());
  return values;
}
function importCSV(event){
  const file = event.target.files[0]; event.target.value=''; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
    if(lines.length < 2) return alert('This CSV has no transaction rows.');
    const headers = parseCSVLine(lines[0]).map(h=>h.toLowerCase());
    const find = names => names.map(n=>headers.indexOf(n)).find(i=>i >= 0);
    const dateIndex=find(['date','transaction date']);
    const amountIndex=find(['amount','value']);
    const descIndex=find(['description','merchant','details','memo']);
    const typeIndex=find(['type','transaction type']);
    const categoryIndex=find(['category']);
    if(dateIndex === undefined || amountIndex === undefined) return alert('CSV needs Date and Amount columns.');
    const existing = new Set(state.transactions.map(t=>`${t.date}|${t.amount}|${t.desc}`));
    let added=0;
    lines.slice(1).forEach(line=>{
      const row=parseCSVLine(line); const amount=Number(String(row[amountIndex] || '').replace(/[^0-9.-]/g,''));
      const date=row[dateIndex]; const desc=row[descIndex] || 'Imported transaction';
      if(!date || !amount) return;
      const type = typeIndex !== undefined ? (String(row[typeIndex]).toLowerCase().includes('income') || amount > 0 ? 'income' : 'expense') : (amount >= 0 ? 'income' : 'expense');
      const absolute=Math.abs(amount); const key=`${date}|${absolute}|${desc}`;
      if(existing.has(key)) return;
      state.transactions.push({id:uid(), date, amount:absolute, type, desc, notes:'Imported from CSV', category:categoryIndex !== undefined && row[categoryIndex] ? row[categoryIndex] : (type==='income'?'Other':'Other'), accountId:'cash'});
      existing.add(key); added++;
    });
    if(!added) return alert('No new transactions found. Existing rows were skipped.');
    persist(); renderAll(); alert(`${added} transaction${added===1?'':'s'} imported.`);
  };
  reader.readAsText(file);
}
function exportCSV(){
  if(!state.transactions.length){ alert('No transactions to export yet.'); return; }
  const rows = [['Date','Type','Category','Description','Amount']];
  [...state.transactions].sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(t=>{
    rows.push([t.date, t.type, t.category, t.desc.replace(/"/g,'""'), t.amount]);
  });
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  downloadFile(csv, `financepro-export-${todayISO()}.csv`, 'text/csv;charset=utf-8;');
}

/* ---------------- render all ---------------- */
function renderAll(){
  renderDashboard();
  renderTransactions();
  renderQuickAdd();
  renderRecurring();
  renderAnalytics();
  renderBudgets();
  renderGoals();
  renderSettings();
}
bootAuth();
