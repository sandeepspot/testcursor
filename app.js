const STORAGE_KEY = "expenseJournalData";
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const state = {
  expenses: [],
  budget: {
    monthly: 0,
    alertPercent: 80,
  },
  targets: [],
};

const cloudState = {
  client: null,
  session: null,
  configured: false,
  syncing: false,
  pendingDeletes: {
    expenses: new Set(),
    targets: new Set(),
  },
};

const elements = {
  expenseForm: document.getElementById("expenseForm"),
  expenseDate: document.getElementById("expenseDate"),
  expenseAmount: document.getElementById("expenseAmount"),
  expenseCategory: document.getElementById("expenseCategory"),
  expenseDescription: document.getElementById("expenseDescription"),
  expenseTable: document.getElementById("expenseTable"),
  monthlyBudget: document.getElementById("monthlyBudget"),
  budgetAlertPercent: document.getElementById("budgetAlertPercent"),
  saveBudgetBtn: document.getElementById("saveBudgetBtn"),
  targetForm: document.getElementById("targetForm"),
  targetCategory: document.getElementById("targetCategory"),
  targetAmount: document.getElementById("targetAmount"),
  targetList: document.getElementById("targetList"),
  statMonthlyTotal: document.getElementById("statMonthlyTotal"),
  statTotal: document.getElementById("statTotal"),
  statAverage: document.getElementById("statAverage"),
  statTopCategory: document.getElementById("statTopCategory"),
  statRemaining: document.getElementById("statRemaining"),
  chart: document.getElementById("categoryChart"),
  alertBox: document.getElementById("alertBox"),
  exportBtn: document.getElementById("exportBtn"),
  clearBtn: document.getElementById("clearBtn"),
  cloudStatus: document.getElementById("cloudStatus"),
  cloudEmail: document.getElementById("cloudEmail"),
  cloudSignInBtn: document.getElementById("cloudSignInBtn"),
  cloudSignOutBtn: document.getElementById("cloudSignOutBtn"),
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const loadState = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    state.expenses = parsed.expenses || [];
    state.budget = parsed.budget || state.budget;
    state.targets = parsed.targets || [];
  } catch (error) {
    console.error("Failed to parse saved data", error);
  }
};

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSync();
};

const formatCurrency = (value) => currencyFormatter.format(value || 0);

const monthKey = (date) => date.slice(0, 7);

const totalsByCategory = (expenses) =>
  expenses.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
    return acc;
  }, {});

const getMonthlyExpenses = () => {
  const currentMonth = monthKey(todayIso());
  return state.expenses.filter((expense) => monthKey(expense.date) === currentMonth);
};

const renderExpenses = () => {
  elements.expenseTable.innerHTML = "";
  state.expenses
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((expense) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${expense.date}</td>
        <td>${expense.description || "-"}</td>
        <td>${expense.category}</td>
        <td>${formatCurrency(expense.amount)}</td>
        <td class="table-actions">
          <button data-id="${expense.id}">Remove</button>
        </td>
      `;
      row.querySelector("button").addEventListener("click", () => {
        cloudState.pendingDeletes.expenses.add(expense.id);
        state.expenses = state.expenses.filter((item) => item.id !== expense.id);
        saveState();
        renderAll();
      });
      elements.expenseTable.appendChild(row);
    });
};

const renderTargets = () => {
  elements.targetList.innerHTML = "";
  if (!state.targets.length) {
    const empty = document.createElement("li");
    empty.textContent = "No targets set yet.";
    elements.targetList.appendChild(empty);
    return;
  }
  state.targets.forEach((target) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <span>${target.category}: ${formatCurrency(target.amount)}</span>
      <button class="btn btn-secondary" data-category="${target.category}">Remove</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      cloudState.pendingDeletes.targets.add(target.category);
      state.targets = state.targets.filter((entry) => entry.category !== target.category);
      saveState();
      renderAll();
    });
    elements.targetList.appendChild(item);
  });
};

const renderStats = () => {
  const total = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const monthlyExpenses = getMonthlyExpenses();
  const monthlyTotal = monthlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const daysInMonth = new Date().getDate();
  const avgDaily = daysInMonth ? monthlyTotal / daysInMonth : 0;
  const totals = totalsByCategory(state.expenses);
  const topCategory = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  const remaining = state.budget.monthly ? state.budget.monthly - monthlyTotal : 0;

  elements.statTotal.textContent = formatCurrency(total);
  elements.statMonthlyTotal.textContent = formatCurrency(monthlyTotal);
  elements.statAverage.textContent = formatCurrency(avgDaily);
  elements.statTopCategory.textContent = topCategory ? topCategory[0] : "-";
  elements.statRemaining.textContent = formatCurrency(remaining);

  elements.monthlyBudget.value = state.budget.monthly || "";
  elements.budgetAlertPercent.value = state.budget.alertPercent ?? 80;
};

const renderAlerts = () => {
  elements.alertBox.innerHTML = "";
  const alerts = [];
  const monthlyTotal = getMonthlyExpenses().reduce((sum, exp) => sum + exp.amount, 0);
  if (state.budget.monthly) {
    const threshold = (state.budget.alertPercent / 100) * state.budget.monthly;
    if (monthlyTotal >= state.budget.monthly) {
      alerts.push({ type: "danger", message: "Monthly budget exceeded." });
    } else if (monthlyTotal >= threshold) {
      alerts.push({ type: "warning", message: "Monthly budget is nearing the alert threshold." });
    }
  }

  const totals = totalsByCategory(getMonthlyExpenses());
  state.targets.forEach((target) => {
    const actual = totals[target.category] || 0;
    if (actual >= target.amount) {
      alerts.push({
        type: "danger",
        message: `${target.category} target exceeded.`,
      });
    } else if (actual >= target.amount * 0.9) {
      alerts.push({
        type: "warning",
        message: `${target.category} is close to its target.`,
      });
    }
  });

  if (!alerts.length) {
    const calm = document.createElement("div");
    calm.className = "alert alert-warning";
    calm.textContent = "No alerts. Targets are on track.";
    elements.alertBox.appendChild(calm);
    return;
  }

  alerts.forEach((alert) => {
    const entry = document.createElement("div");
    entry.className = `alert alert-${alert.type}`;
    entry.textContent = alert.message;
    elements.alertBox.appendChild(entry);
  });
};

const updateCloudStatus = (message, tone = "neutral") => {
  if (!elements.cloudStatus) return;
  elements.cloudStatus.textContent = message;
  elements.cloudStatus.style.color =
    tone === "error" ? "#b91c1c" : tone === "success" ? "#15803d" : "#1f2937";
};

const getSupabaseConfig = () => {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.anonKey) return null;
  if (config.url.includes("your-project") || config.anonKey.includes("your-anon-key")) {
    return null;
  }
  return config;
};

const initSupabase = async () => {
  if (!window.supabase || !elements.cloudStatus) return;
  const config = getSupabaseConfig();
  if (!config) {
    updateCloudStatus("Cloud sync not configured. Update config.js to enable.");
    return;
  }
  cloudState.configured = true;
  cloudState.client = window.supabase.createClient(config.url, config.anonKey);
  updateCloudStatus("Cloud sync ready. Sign in to enable.");

  const sessionResult = await cloudState.client.auth.getSession();
  cloudState.session = sessionResult.data.session;
  handleSessionChange();

  cloudState.client.auth.onAuthStateChange((_event, session) => {
    cloudState.session = session;
    handleSessionChange();
  });
};

const handleSessionChange = () => {
  if (!cloudState.configured) return;
  if (cloudState.session?.user) {
    updateCloudStatus(`Signed in as ${cloudState.session.user.email}`, "success");
    elements.cloudSignOutBtn.disabled = false;
    pullFromCloud();
  } else {
    updateCloudStatus("Not signed in. Use the email link to enable cloud sync.");
    elements.cloudSignOutBtn.disabled = true;
  }
};

const pullFromCloud = async () => {
  if (!cloudState.session?.user) return;
  const userId = cloudState.session.user.id;
  const [expensesResult, targetsResult, budgetResult] = await Promise.all([
    cloudState.client.from("expenses").select("*").eq("user_id", userId),
    cloudState.client.from("targets").select("*").eq("user_id", userId),
    cloudState.client.from("budgets").select("*").eq("user_id", userId).limit(1),
  ]);

  if (expensesResult.error || targetsResult.error || budgetResult.error) {
    updateCloudStatus("Cloud sync failed. Check Supabase tables and policies.", "error");
    return;
  }

  state.expenses = (expensesResult.data || []).map((expense) => ({
    id: expense.id,
    date: expense.date,
    amount: expense.amount,
    category: expense.category,
    description: expense.description || "",
  }));
  state.targets = (targetsResult.data || []).map((target) => ({
    category: target.category,
    amount: target.amount,
  }));
  const budget = budgetResult.data?.[0];
  state.budget = {
    monthly: budget?.monthly || 0,
    alertPercent: budget?.alert_percent ?? 80,
  };

  saveState();
  renderAll();
};

const queueCloudSync = () => {
  if (!cloudState.configured || !cloudState.session?.user) return;
  if (cloudState.syncing) return;
  cloudState.syncing = true;
  setTimeout(syncToCloud, 600);
};

const syncToCloud = async () => {
  if (!cloudState.session?.user) {
    cloudState.syncing = false;
    return;
  }

  const userId = cloudState.session.user.id;
  const expensesPayload = state.expenses.map((expense) => ({
    ...expense,
    user_id: userId,
  }));
  const targetsPayload = state.targets.map((target) => ({
    ...target,
    user_id: userId,
  }));
  const budgetPayload = {
    user_id: userId,
    monthly: state.budget.monthly || 0,
    alert_percent: state.budget.alertPercent ?? 80,
  };

  try {
    if (expensesPayload.length) {
      await cloudState.client.from("expenses").upsert(expensesPayload, { onConflict: "id" });
    }
    if (targetsPayload.length) {
      await cloudState.client.from("targets").upsert(targetsPayload, {
        onConflict: "user_id,category",
      });
    }
    await cloudState.client.from("budgets").upsert(budgetPayload, { onConflict: "user_id" });

    if (cloudState.pendingDeletes.expenses.size) {
      const ids = Array.from(cloudState.pendingDeletes.expenses);
      await cloudState.client.from("expenses").delete().in("id", ids).eq("user_id", userId);
      cloudState.pendingDeletes.expenses.clear();
    }
    if (cloudState.pendingDeletes.targets.size) {
      const categories = Array.from(cloudState.pendingDeletes.targets);
      await cloudState.client
        .from("targets")
        .delete()
        .in("category", categories)
        .eq("user_id", userId);
      cloudState.pendingDeletes.targets.clear();
    }

    updateCloudStatus("Cloud sync complete.", "success");
  } catch (error) {
    console.error("Cloud sync failed", error);
    updateCloudStatus("Cloud sync failed. Try again.", "error");
  } finally {
    cloudState.syncing = false;
  }
};

const renderChart = () => {
  const ctx = elements.chart.getContext("2d");
  const width = elements.chart.width = elements.chart.offsetWidth;
  const height = elements.chart.height = 220;
  ctx.clearRect(0, 0, width, height);

  const totals = totalsByCategory(getMonthlyExpenses());
  const entries = Object.entries(totals);
  if (!entries.length) {
    ctx.fillStyle = "#6b7280";
    ctx.fillText("No expenses recorded yet.", 12, 20);
    return;
  }

  const maxValue = Math.max(...entries.map(([, value]) => value));
  const barWidth = Math.max(30, width / entries.length - 20);
  const gap = 16;
  let x = 20;

  entries.forEach(([category, value]) => {
    const barHeight = (value / maxValue) * (height - 60);
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(x, height - barHeight - 30, barWidth, barHeight);
    ctx.fillStyle = "#111827";
    ctx.font = "12px sans-serif";
    ctx.fillText(category, x, height - 10);
    ctx.fillStyle = "#6b7280";
    ctx.fillText(formatCurrency(value), x, height - barHeight - 36);
    x += barWidth + gap;
  });
};

const renderAll = () => {
  renderExpenses();
  renderTargets();
  renderStats();
  renderAlerts();
  renderChart();
};

elements.expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = parseFloat(elements.expenseAmount.value);
  if (!amount || amount < 0) return;
  const expense = {
    id: crypto.randomUUID(),
    date: elements.expenseDate.value,
    amount,
    category: elements.expenseCategory.value,
    description: elements.expenseDescription.value.trim(),
  };
  state.expenses.push(expense);
  saveState();
  elements.expenseAmount.value = "";
  elements.expenseDescription.value = "";
  renderAll();
});

elements.targetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = parseFloat(elements.targetAmount.value);
  if (!amount || amount < 0) return;
  const category = elements.targetCategory.value;
  const existing = state.targets.find((target) => target.category === category);
  if (existing) {
    existing.amount = amount;
  } else {
    state.targets.push({ category, amount });
  }
  elements.targetAmount.value = "";
  saveState();
  renderAll();
});

elements.saveBudgetBtn.addEventListener("click", () => {
  const monthly = parseFloat(elements.monthlyBudget.value) || 0;
  const alertPercent = parseFloat(elements.budgetAlertPercent.value) || 0;
  state.budget.monthly = monthly;
  state.budget.alertPercent = Math.min(Math.max(alertPercent, 0), 100);
  saveState();
  renderAll();
});

elements.exportBtn.addEventListener("click", () => {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "expense-journal-export.json";
  link.click();
  URL.revokeObjectURL(url);
});

elements.clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all expenses, targets, and budget settings?")) return;
  const expenseIds = state.expenses.map((item) => item.id);
  const targetCategories = state.targets.map((item) => item.category);
  state.expenses = [];
  state.targets = [];
  state.budget = { monthly: 0, alertPercent: 80 };
  cloudState.pendingDeletes.expenses = new Set(expenseIds);
  cloudState.pendingDeletes.targets = new Set(targetCategories);
  saveState();
  renderAll();
});

elements.cloudSignInBtn.addEventListener("click", async () => {
  if (!cloudState.client) {
    updateCloudStatus("Cloud sync not configured. Update config.js first.", "error");
    return;
  }
  const email = elements.cloudEmail.value.trim();
  if (!email) {
    updateCloudStatus("Enter an email to receive a sign-in link.", "error");
    return;
  }
  const result = await cloudState.client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (result.error) {
    updateCloudStatus("Sign-in failed. Check the email and try again.", "error");
    return;
  }
  updateCloudStatus("Magic link sent. Check your email to finish sign-in.", "success");
});

elements.cloudSignOutBtn.addEventListener("click", async () => {
  if (!cloudState.client) return;
  await cloudState.client.auth.signOut();
  updateCloudStatus("Signed out from cloud sync.");
});

const init = () => {
  loadState();
  elements.expenseDate.value = todayIso();
  renderAll();
  initSupabase();
};

init();
