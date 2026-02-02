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
  state.expenses = [];
  state.targets = [];
  state.budget = { monthly: 0, alertPercent: 80 };
  saveState();
  renderAll();
});

const init = () => {
  loadState();
  elements.expenseDate.value = todayIso();
  renderAll();
};

init();
