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
  mfa: {
    factors: [],
    enrolledFactorId: null,
    challengeId: null,
    pendingFactorId: null,
    pendingLogin: false,
  },
  profile: null,
  isAdmin: false,
};

const elements = {
  appShell: document.getElementById("appShell"),
  authOverlay: document.getElementById("authOverlay"),
  authStatus: document.getElementById("authStatus"),
  authTabSignIn: document.getElementById("authTabSignIn"),
  authTabSignUp: document.getElementById("authTabSignUp"),
  authSignInForm: document.getElementById("authSignInForm"),
  authSignUpForm: document.getElementById("authSignUpForm"),
  authSignInEmail: document.getElementById("authSignInEmail"),
  authSignInPassword: document.getElementById("authSignInPassword"),
  authSignUpEmail: document.getElementById("authSignUpEmail"),
  authSignUpPassword: document.getElementById("authSignUpPassword"),
  authMfaGroup: document.getElementById("authMfaGroup"),
  authMfaCode: document.getElementById("authMfaCode"),
  authMfaVerifyBtn: document.getElementById("authMfaVerifyBtn"),
  authGoogleBtn: document.getElementById("authGoogleBtn"),
  authGithubBtn: document.getElementById("authGithubBtn"),
  authMicrosoftBtn: document.getElementById("authMicrosoftBtn"),
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
  mfaStatus: document.getElementById("mfaStatus"),
  mfaEnrollBtn: document.getElementById("mfaEnrollBtn"),
  mfaDisableBtn: document.getElementById("mfaDisableBtn"),
  mfaEnrollArea: document.getElementById("mfaEnrollArea"),
  mfaQr: document.getElementById("mfaQr"),
  mfaSecret: document.getElementById("mfaSecret"),
  mfaCode: document.getElementById("mfaCode"),
  mfaVerifyBtn: document.getElementById("mfaVerifyBtn"),
  adminPanel: document.getElementById("adminPanel"),
  adminUserForm: document.getElementById("adminUserForm"),
  adminUserEmail: document.getElementById("adminUserEmail"),
  adminUserRole: document.getElementById("adminUserRole"),
  adminUserActive: document.getElementById("adminUserActive"),
  adminUserList: document.getElementById("adminUserList"),
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
  cloudState.client = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
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
    if (!cloudState.mfa.pendingLogin) {
      setAuthOverlay(false);
    }
    refreshMfaStatus();
    ensureProfile();
    pullFromCloud();
  } else {
    updateCloudStatus("Not signed in. Use the login screen to enable cloud sync.");
    elements.cloudSignOutBtn.disabled = true;
    setMfaStatus("Not configured.");
    elements.mfaDisableBtn.disabled = true;
    elements.mfaEnrollArea.classList.add("hidden");
    setAuthOverlay(true);
  }
};

const setAuthOverlay = (visible) => {
  if (!elements.authOverlay || !elements.appShell) return;
  elements.authOverlay.classList.toggle("hidden", !visible);
  elements.appShell.classList.toggle("hidden", visible);
};

const setAuthStatus = (message, tone = "neutral") => {
  if (!elements.authStatus) return;
  elements.authStatus.textContent = message;
  elements.authStatus.style.color =
    tone === "error" ? "#b91c1c" : tone === "success" ? "#15803d" : "#475569";
};

const switchAuthTab = (tab) => {
  const isSignIn = tab === "signin";
  elements.authTabSignIn.classList.toggle("active", isSignIn);
  elements.authTabSignUp.classList.toggle("active", !isSignIn);
  elements.authSignInForm.classList.toggle("hidden", !isSignIn);
  elements.authSignUpForm.classList.toggle("hidden", isSignIn);
  elements.authMfaGroup.classList.add("hidden");
  elements.authMfaCode.value = "";
  setAuthStatus("");
};

const getRedirectUrl = () => {
  const config = getSupabaseConfig();
  return config?.redirectUrl || window.location.href;
};

const signInWithPassword = async (email, password) => {
  if (!cloudState.client) return;
  setAuthStatus("Signing in...");
  const result = await cloudState.client.auth.signInWithPassword({ email, password });
  if (result.error) {
    setAuthStatus(result.error.message || "Sign-in failed.", "error");
    return;
  }
  await maybePromptMfa();
};

const signUpWithPassword = async (email, password) => {
  if (!cloudState.client) return;
  setAuthStatus("Creating account...");
  const result = await cloudState.client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: getRedirectUrl() },
  });
  if (result.error) {
    setAuthStatus(result.error.message || "Sign-up failed.", "error");
    return;
  }
  setAuthStatus("Check your email to confirm your account.", "success");
};

const signInWithProvider = async (provider) => {
  if (!cloudState.client) return;
  await cloudState.client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: getRedirectUrl() },
  });
};

const maybePromptMfa = async () => {
  if (!cloudState.client) return;
  const factors = await cloudState.client.auth.mfa.listFactors();
  if (factors.error) return;
  const verified = factors.data?.all?.find((factor) => factor.status === "verified");
  if (verified) {
    cloudState.mfa.pendingLogin = true;
    cloudState.mfa.pendingFactorId = verified.id;
    elements.authMfaGroup.classList.remove("hidden");
    setAuthStatus("Enter your 2FA code to finish sign-in.", "warning");
    setAuthOverlay(true);
  }
};

const verifyLoginMfa = async () => {
  if (!cloudState.client || !cloudState.mfa.pendingFactorId) return;
  const code = elements.authMfaCode.value.trim();
  if (!code) {
    setAuthStatus("Enter your 2FA code.", "error");
    return;
  }
  const challenge = await cloudState.client.auth.mfa.challenge({
    factorId: cloudState.mfa.pendingFactorId,
  });
  if (challenge.error) {
    setAuthStatus("2FA challenge failed.", "error");
    return;
  }
  const verify = await cloudState.client.auth.mfa.verify({
    factorId: cloudState.mfa.pendingFactorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) {
    setAuthStatus("2FA code invalid.", "error");
    return;
  }
  cloudState.mfa.pendingLogin = false;
  cloudState.mfa.pendingFactorId = null;
  elements.authMfaGroup.classList.add("hidden");
  setAuthStatus("Signed in.", "success");
  setAuthOverlay(false);
};

const ensureProfile = async () => {
  if (!cloudState.session?.user || !cloudState.client) return;
  const user = cloudState.session.user;
  const existing = await cloudState.client
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  let profile = existing.data;
  if (existing.error && existing.error.code !== "PGRST116") {
    console.error("Profile lookup error", existing.error);
    const insertFallback = await cloudState.client
      .from("profiles")
      .insert({
        user_id: user.id,
        email: user.email,
        role: "user",
        active: true,
      })
      .select("*")
      .single();
    if (insertFallback.error) {
      updateCloudStatus(
        `Profile setup failed: ${insertFallback.error.message || "check RLS policies"}`,
        "error"
      );
      return;
    }
    profile = insertFallback.data;
  }
  if (!profile) {
    const insert = await cloudState.client
      .from("profiles")
      .insert({
        user_id: user.id,
        email: user.email,
        role: "user",
        active: true,
      })
      .select("*")
      .single();
    if (insert.error) {
      updateCloudStatus(
        `Profile setup failed: ${insert.error.message || "check RLS policies"}`,
        "error"
      );
      return;
    }
    profile = insert.data;
  }
  cloudState.profile = profile;
  if (!profile.active) {
    updateCloudStatus("Access disabled by admin.", "error");
    await cloudState.client.auth.signOut();
    return;
  }
  await refreshAdminStatus();
  toggleAdminPanel(cloudState.isAdmin);
};

const refreshAdminStatus = async () => {
  if (!cloudState.client || !cloudState.session?.user) return;
  const result = await cloudState.client
    .from("admins")
    .select("user_id")
    .eq("user_id", cloudState.session.user.id)
    .maybeSingle();
  cloudState.isAdmin = Boolean(result.data);
};

const toggleAdminPanel = (isAdmin) => {
  if (!elements.adminPanel) return;
  elements.adminPanel.classList.toggle("hidden", !isAdmin);
  if (isAdmin) {
    loadAdminUsers();
  }
};

const loadAdminUsers = async () => {
  if (!cloudState.client) return;
  const { data, error } = await cloudState.client.from("profiles").select("*").order("email");
  if (error) {
    updateCloudStatus("Unable to load users.", "error");
    return;
  }
  elements.adminUserList.innerHTML = "";
  data.forEach((profile) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <span>${profile.email} (${profile.role}) ${profile.active ? "" : "• disabled"}</span>
      <button class="btn btn-secondary" data-email="${profile.email}">Edit</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      elements.adminUserEmail.value = profile.email;
      elements.adminUserRole.value = profile.role;
      elements.adminUserActive.value = profile.active ? "true" : "false";
    });
    elements.adminUserList.appendChild(item);
  });
};

const setMfaStatus = (text, tone = "neutral") => {
  if (!elements.mfaStatus) return;
  elements.mfaStatus.textContent = text;
  elements.mfaStatus.style.background =
    tone === "success" ? "#dcfce7" : tone === "warning" ? "#fef3c7" : "#e5e7eb";
  elements.mfaStatus.style.color =
    tone === "success" ? "#166534" : tone === "warning" ? "#92400e" : "#111827";
};

const refreshMfaStatus = async () => {
  if (!cloudState.client || !cloudState.session?.user) return;
  const result = await cloudState.client.auth.mfa.listFactors();
  if (result.error) {
    setMfaStatus("2FA unavailable.", "warning");
    return;
  }
  cloudState.mfa.factors = result.data?.all || [];
  const verifiedFactor = cloudState.mfa.factors.find((factor) => factor.status === "verified");
  if (verifiedFactor) {
    cloudState.mfa.enrolledFactorId = verifiedFactor.id;
    setMfaStatus("Enabled", "success");
    elements.mfaDisableBtn.disabled = false;
    elements.mfaEnrollArea.classList.add("hidden");
    return;
  }
  setMfaStatus("Not enabled", "warning");
  elements.mfaDisableBtn.disabled = true;
};

const enrollMfa = async () => {
  if (!cloudState.client || !cloudState.session?.user) {
    updateCloudStatus("Sign in before enabling 2FA.", "error");
    return;
  }
  const result = await cloudState.client.auth.mfa.enroll({ factorType: "totp" });
  if (result.error) {
    updateCloudStatus("2FA enrollment failed. Try again.", "error");
    return;
  }
  const { id, totp } = result.data;
  cloudState.mfa.enrolledFactorId = id;
  cloudState.mfa.challengeId = null;
  if (totp?.qr_code) {
    elements.mfaQr.src = totp.qr_code;
  }
  elements.mfaSecret.textContent = totp?.secret || "";
  elements.mfaEnrollArea.classList.remove("hidden");
  setMfaStatus("Scan QR and verify", "warning");
};

const verifyMfa = async () => {
  const code = elements.mfaCode.value.trim();
  if (!code || code.length < 6) {
    updateCloudStatus("Enter the 6-digit code from your authenticator.", "error");
    return;
  }
  if (!cloudState.mfa.enrolledFactorId) {
    updateCloudStatus("Start 2FA setup first.", "error");
    return;
  }
  const challenge = await cloudState.client.auth.mfa.challenge({
    factorId: cloudState.mfa.enrolledFactorId,
  });
  if (challenge.error) {
    updateCloudStatus("2FA challenge failed. Try again.", "error");
    return;
  }
  const verify = await cloudState.client.auth.mfa.verify({
    factorId: cloudState.mfa.enrolledFactorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) {
    updateCloudStatus("2FA verification failed. Check your code.", "error");
    return;
  }
  elements.mfaEnrollArea.classList.add("hidden");
  elements.mfaCode.value = "";
  await refreshMfaStatus();
};

const disableMfa = async () => {
  if (!cloudState.mfa.enrolledFactorId) return;
  const result = await cloudState.client.auth.mfa.unenroll({
    factorId: cloudState.mfa.enrolledFactorId,
  });
  if (result.error) {
    updateCloudStatus("Unable to disable 2FA.", "error");
    return;
  }
  cloudState.mfa.enrolledFactorId = null;
  setMfaStatus("Not enabled", "warning");
  elements.mfaDisableBtn.disabled = true;
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
  const config = getSupabaseConfig();
  const redirectUrl = config?.redirectUrl || window.location.href;
  const result = await cloudState.client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl },
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
  cloudState.mfa.pendingLogin = false;
  cloudState.mfa.pendingFactorId = null;
});

elements.mfaEnrollBtn.addEventListener("click", enrollMfa);
elements.mfaVerifyBtn.addEventListener("click", verifyMfa);
elements.mfaDisableBtn.addEventListener("click", disableMfa);

elements.authTabSignIn.addEventListener("click", () => switchAuthTab("signin"));
elements.authTabSignUp.addEventListener("click", () => switchAuthTab("signup"));

elements.authSignInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signInWithPassword(
    elements.authSignInEmail.value.trim(),
    elements.authSignInPassword.value
  );
});

elements.authSignUpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signUpWithPassword(
    elements.authSignUpEmail.value.trim(),
    elements.authSignUpPassword.value
  );
});

elements.authMfaVerifyBtn.addEventListener("click", verifyLoginMfa);

elements.authGoogleBtn.addEventListener("click", () => signInWithProvider("google"));
elements.authGithubBtn.addEventListener("click", () => signInWithProvider("github"));
elements.authMicrosoftBtn.addEventListener("click", () => signInWithProvider("azure"));

elements.adminUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!cloudState.client) return;
  if (!cloudState.isAdmin) {
    updateCloudStatus("Admin access required.", "error");
    return;
  }
  const email = elements.adminUserEmail.value.trim();
  const role = elements.adminUserRole.value;
  const active = elements.adminUserActive.value === "true";
  if (!email) return;
  const lookup = await cloudState.client.from("profiles").select("*").eq("email", email).single();
  if (lookup.error) {
    updateCloudStatus("User not found. Ask them to sign up first.", "error");
    return;
  }
  const update = await cloudState.client
    .from("profiles")
    .update({ role, active })
    .eq("user_id", lookup.data.user_id)
    .select("*")
    .single();
  if (update.error) {
    updateCloudStatus("Unable to update user.", "error");
    return;
  }
  updateCloudStatus("User updated.", "success");
  elements.adminUserEmail.value = "";
  await loadAdminUsers();
});

const init = () => {
  setAuthOverlay(true);
  switchAuthTab("signin");
  loadState();
  elements.expenseDate.value = todayIso();
  renderAll();
  initSupabase();
};

init();
