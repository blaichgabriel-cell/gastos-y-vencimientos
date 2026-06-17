"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CircleDollarSign,
  Edit2,
  Filter,
  LogOut,
  PieChart,
  Plus,
  TrendingUp,
  Trash2,
  WalletCards,
  X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  categories,
  Expense,
  ExpenseKind,
  ExpenseStatus,
  FinancialAccount,
  FinancialAccountInput,
  FinancialAccountType,
  formatCurrency,
  getComputedStatus,
  incomeCategories,
  MovementKind,
  statusLabels
} from "@/lib/expenses";
import { hasSupabaseConfig, supabase } from "@/lib/supabase/client";

type ExpenseForm = {
  title: string;
  amount: string;
  transaction_type: "expense" | "income";
  expense_kind: ExpenseKind;
  movement_kind: MovementKind;
  account_id: string;
  payment_target_account_id: string;
  client_token: string;
  category: string;
  due_date: string;
  recurrence: "none" | "monthly";
  notes: string;
};

function createDefaultAccountForm(): FinancialAccountInput {
  return {
    name: "",
    institution: "",
    account_type: "bank",
    balance: "",
    credit_limit: "",
    credit_used: "",
    statement_day: "",
    due_day: "",
    notes: ""
  };
}

type MonthlyReport = {
  month: string;
  income: number;
  expenses: number;
  fixed: number;
  variable: number;
  balance: number;
  movements: number;
};

function parseGuaraniAmount(value: string) {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

function formatGuaraniInput(value: string | number) {
  const amount = typeof value === "number" ? value : parseGuaraniAmount(value);
  if (!amount) return "";
  return new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0
  }).format(amount);
}

function createDefaultForm(): ExpenseForm {
  return {
    title: "",
    amount: "",
    transaction_type: "expense",
    expense_kind: "variable",
    movement_kind: "normal",
    account_id: "",
    payment_target_account_id: "",
    client_token: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    category: "Servicios",
    due_date: new Date().toISOString().slice(0, 10),
    recurrence: "none",
    notes: ""
  };
}

function sortExpenses(items: Expense[]) {
  return [...items].sort((a, b) => {
    const dueCompare = a.due_date.localeCompare(b.due_date);
    if (dueCompare !== 0) return dueCompare;

    const createdCompare = a.created_at.localeCompare(b.created_at);
    if (createdCompare !== 0) return createdCompare;

    return a.id.localeCompare(b.id);
  });
}

function getTransactionType(expense: Expense) {
  return expense.transaction_type || "expense";
}

function getExpenseKind(expense: Expense) {
  return expense.expense_kind ?? (expense.recurrence === "monthly" ? "fixed" : "variable");
}

function getMovementKind(expense: Expense) {
  return expense.movement_kind ?? "normal";
}

function isCreditAccount(account: FinancialAccount | undefined) {
  return account?.account_type === "credit_card" || account?.account_type === "debt";
}

const accountTypeLabels: Record<FinancialAccountType, string> = {
  bank: "Banco",
  cash: "Efectivo",
  savings: "Ahorro",
  investment: "Inversion",
  credit_card: "Tarjeta",
  debt: "Deuda"
};

function getMonthLabel(monthKey: string) {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString("es-PY", {
    month: "long",
    year: "numeric"
  });
}

function getPreviousMonthKey(monthKey: string) {
  const [year, monthNumber] = monthKey.split("-").map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return date.toISOString().slice(0, 7);
}

function createEmptyReport(monthKey: string): MonthlyReport {
  return {
    month: monthKey,
    income: 0,
    expenses: 0,
    fixed: 0,
    variable: 0,
    balance: 0,
    movements: 0
  };
}

function getReportStatus(balanceAmount: number) {
  if (balanceAmount > 0) return "Sobro plata";
  if (balanceAmount < 0) return "Falto plata";
  return "Quedo justo";
}

export function ExpenseApp() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [form, setForm] = useState<ExpenseForm>(() => createDefaultForm());
  const [accountForm, setAccountForm] = useState<FinancialAccountInput>(() => createDefaultAccountForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [month, setMonth] = useState("all");
  const [transactionFilter, setTransactionFilter] = useState<"all" | "expense" | "income">("all");
  const [kindFilter, setKindFilter] = useState<"all" | "fixed" | "variable">("all");
  const [category, setCategory] = useState("all");
  const [notice, setNotice] = useState("");
  const [activeView, setActiveView] = useState<"panel" | "cuentas" | "balances" | "vencimientos" | "alertas">("panel");
  const savingRef = useRef(false);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setNotice("Faltan las variables de Supabase en .env.local.");
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/auth");
        return;
      }
      setSession(data.session);
      loadExpenses();
      loadAccounts();
    });
  }, [router]);

  async function loadExpenses() {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (requestId !== loadRequestRef.current) return;
    if (error) setNotice(`No se pudieron cargar los gastos: ${error.message}`);
    if (!error && data) setExpenses(sortExpenses(data as Expense[]));
    setLoading(false);
  }

  async function loadAccounts() {
    const { data, error } = await supabase
      .from("financial_accounts")
      .select("*")
      .order("account_type", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      setNotice(`No se pudieron cargar las cuentas: ${error.message}`);
      return;
    }
    if (data) setAccounts(data as FinancialAccount[]);
  }

  const periodExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const transactionType = getTransactionType(expense);
      return (
        (month === "all" || expense.due_date.startsWith(month)) &&
        (transactionFilter === "all" || transactionType === transactionFilter) &&
        (kindFilter === "all" || (transactionType === "expense" && getExpenseKind(expense) === kindFilter)) &&
        (category === "all" || expense.category === category)
      );
    });
  }, [expenses, month, transactionFilter, kindFilter, category]);

  const summary = useMemo(() => {
    return periodExpenses.reduce(
      (acc, expense) => {
        const transactionType = getTransactionType(expense);
        if (getMovementKind(expense) === "card_payment") return acc;
        if (transactionType === "income") {
          acc.income += Number(expense.amount);
          return acc;
        }

        acc.expenses += Number(expense.amount);
        if (getExpenseKind(expense) === "fixed") acc.fixed += Number(expense.amount);
        else acc.variable += Number(expense.amount);
        const computed = getComputedStatus(expense);
        if (computed === "paid") acc.paid += Number(expense.amount);
        else acc.pending += Number(expense.amount);
        if (computed === "due_today" || computed === "upcoming") acc.upcoming += 1;
        return acc;
      },
      { income: 0, expenses: 0, fixed: 0, variable: 0, pending: 0, paid: 0, upcoming: 0 }
    );
  }, [periodExpenses]);

  const balance = summary.income - summary.expenses;
  const totalExpenseKinds = summary.fixed + summary.variable;
  const fixedPercent = totalExpenseKinds > 0 ? Math.round((summary.fixed / totalExpenseKinds) * 100) : 0;
  const variablePercent = totalExpenseKinds > 0 ? 100 - fixedPercent : 0;
  const cashflowMax = Math.max(summary.income, summary.expenses, 1);
  const balanceTone = balance >= 0 ? "positive" : "negative";
  const overdueCount = periodExpenses.filter((expense) => getTransactionType(expense) === "expense" && getComputedStatus(expense) === "overdue").length;
  const dueTodayCount = periodExpenses.filter((expense) => getTransactionType(expense) === "expense" && getComputedStatus(expense) === "due_today").length;
  const spendingRatio = summary.income > 0 ? Math.round((summary.expenses / summary.income) * 100) : summary.expenses > 0 ? 100 : 0;
  const savingRate = summary.income > 0 ? Math.round((balance / summary.income) * 100) : 0;
  const healthLabel = balance < 0
    ? "Balance negativo"
    : overdueCount > 0
      ? "Pagos vencidos"
      : spendingRatio > 85
        ? "Gastos altos"
        : "Mes controlado";
  const healthCopy = balance < 0
    ? "Tus gastos superan tus ingresos en este periodo."
    : overdueCount > 0
      ? "Hay pagos que necesitan atencion inmediata."
      : spendingRatio > 85
        ? "Estas usando gran parte de tus ingresos."
        : "Tus ingresos cubren bien los gastos visibles.";

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    periodExpenses.forEach((expense) => {
      if (getTransactionType(expense) !== "expense") return;
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + Number(expense.amount));
    });

    return Array.from(totals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [periodExpenses]);

  const maxCategoryAmount = Math.max(...categoryBreakdown.map((item) => item.amount), 1);

  const monthlyReports = useMemo(() => {
    const reports = new Map<string, MonthlyReport>();

    expenses.forEach((expense) => {
      const reportMonth = expense.due_date.slice(0, 7);
      const report = reports.get(reportMonth) ?? createEmptyReport(reportMonth);
      const amount = Number(expense.amount);

      report.movements += 1;
      if (getMovementKind(expense) === "card_payment") {
        reports.set(reportMonth, report);
        return;
      }
      if (getTransactionType(expense) === "income") {
        report.income += amount;
      } else {
        report.expenses += amount;
        if (getExpenseKind(expense) === "fixed") report.fixed += amount;
        else report.variable += amount;
      }
      report.balance = report.income - report.expenses;
      reports.set(reportMonth, report);
    });

    return Array.from(reports.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [expenses]);

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const previousMonthKey = getPreviousMonthKey(currentMonthKey);
  const currentReport = monthlyReports.find((report) => report.month === currentMonthKey) ?? createEmptyReport(currentMonthKey);
  const previousReport = monthlyReports.find((report) => report.month === previousMonthKey) ?? createEmptyReport(previousMonthKey);
  const reportDelta = {
    income: currentReport.income - previousReport.income,
    expenses: currentReport.expenses - previousReport.expenses,
    balance: currentReport.balance - previousReport.balance
  };

  const accountSnapshots = useMemo(() => {
    return accounts.map((account) => {
      let projectedBalance = Number(account.balance ?? 0);
      let projectedDebt = Number(account.credit_used ?? 0);

      expenses.forEach((expense) => {
        const amount = Number(expense.amount);
        const movementKind = getMovementKind(expense);
        const transactionType = getTransactionType(expense);

        if (movementKind === "card_payment") {
          if (expense.account_id === account.id && !isCreditAccount(account)) projectedBalance -= amount;
          if (expense.payment_target_account_id === account.id && isCreditAccount(account)) projectedDebt -= amount;
          return;
        }

        if (expense.account_id !== account.id) return;
        if (isCreditAccount(account)) {
          if (transactionType === "expense") projectedDebt += amount;
          if (transactionType === "income") projectedDebt -= amount;
        } else {
          if (transactionType === "income") projectedBalance += amount;
          if (transactionType === "expense") projectedBalance -= amount;
        }
      });

      const safeDebt = Math.max(projectedDebt, 0);
      const creditLimit = Number(account.credit_limit ?? 0);
      return {
        account,
        balance: projectedBalance,
        debt: safeDebt,
        availableCredit: Math.max(creditLimit - safeDebt, 0)
      };
    });
  }, [accounts, expenses]);

  const accountsSummary = accountSnapshots.reduce(
    (acc, item) => {
      if (isCreditAccount(item.account)) {
        acc.creditLimit += Number(item.account.credit_limit ?? 0);
        acc.creditUsed += item.debt;
        acc.availableCredit += item.availableCredit;
        return acc;
      }

      if (item.account.account_type === "investment") acc.investments += item.balance;
      else acc.available += item.balance;
      return acc;
    },
    { available: 0, investments: 0, creditLimit: 0, creditUsed: 0, availableCredit: 0 }
  );
  const netWorth = accountsSummary.available + accountsSummary.investments - accountsSummary.creditUsed;
  const assetAccounts = accounts.filter((account) => !isCreditAccount(account));
  const creditAccounts = accounts.filter((account) => isCreditAccount(account));

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setNotice("");

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? session?.user.id;

      if (userError || !userId) {
        setNotice("Tu sesion no esta activa. Cerra sesion y volve a entrar.");
        return;
      }

      const parsedAmount = parseGuaraniAmount(form.amount);

      if (!form.title.trim() || parsedAmount <= 0) {
        setNotice("Completa un nombre y un monto mayor a cero.");
        return;
      }

      const existing = editingId ? expenses.find((expense) => expense.id === editingId) : null;
      const existingType = existing ? getTransactionType(existing) : null;
      const changedType = Boolean(existing && existingType !== form.transaction_type);
      const now = new Date().toISOString();
      const isIncome = form.transaction_type === "income";
      const movementKind = isIncome ? "normal" : form.movement_kind;

      if (movementKind === "card_payment" && (!form.account_id || !form.payment_target_account_id)) {
        setNotice("Para pagar una tarjeta elegi la cuenta de origen y la tarjeta destino.");
        return;
      }

      const nextStatus: ExpenseStatus = isIncome
        ? "paid"
        : existing && !changedType
          ? existing.status
          : "pending";
      const nextPaidAt = isIncome
        ? existing?.paid_at ?? now
        : existing && !changedType
          ? existing.paid_at
          : null;

      const payload = {
        title: form.title.trim(),
        amount: parsedAmount,
        transaction_type: form.transaction_type,
        expense_kind: isIncome ? null : form.expense_kind,
        movement_kind: movementKind,
        account_id: form.account_id || null,
        payment_target_account_id: movementKind === "card_payment" ? form.payment_target_account_id : null,
        client_token: existing?.client_token ?? form.client_token,
        category: form.category,
        due_date: form.due_date,
        recurrence: isIncome ? "none" : form.recurrence,
        user_id: userId,
        status: nextStatus,
        paid_at: nextPaidAt,
        notes: form.notes.trim() || null,
        updated_at: now
      };

      const result = editingId
        ? await supabase.from("expenses").update(payload).eq("id", editingId).select("*").single()
        : await supabase.from("expenses").insert(payload).select("*").single();

      if (result.error) {
        setNotice(`No se pudo guardar: ${result.error.message}`);
        return;
      }

      const savedExpense = result.data as Expense;
      setExpenses((current) => {
        const withoutEdited = current.filter((expense) => expense.id !== savedExpense.id);
        return sortExpenses([...withoutEdited, savedExpense]);
      });
      setMonth("all");
      setTransactionFilter("all");
      setKindFilter("all");
      setCategory("all");
      setForm(createDefaultForm());
      setEditingId(null);
      setShowForm(false);
      setNotice(editingId ? "Movimiento actualizado." : "Movimiento guardado.");
      await loadExpenses();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar el movimiento.");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(createDefaultForm());
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(createDefaultForm());
    setShowForm(false);
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id);
    setForm({
      title: expense.title,
      amount: formatGuaraniInput(Number(expense.amount)),
      transaction_type: getTransactionType(expense),
      expense_kind: getExpenseKind(expense),
      movement_kind: getMovementKind(expense),
      account_id: expense.account_id ?? "",
      payment_target_account_id: expense.payment_target_account_id ?? "",
      client_token: expense.client_token ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
      category: expense.category,
      due_date: expense.due_date,
      recurrence: expense.recurrence,
      notes: expense.notes ?? ""
    });
    setShowForm(true);
  }

  async function togglePaid(expense: Expense) {
    const isPaid = Boolean(expense.paid_at);
    if (getTransactionType(expense) === "income") return;
    const nextPaidAt = isPaid ? null : new Date().toISOString();
    const nextStatus = isPaid ? "pending" : "paid";
    const { data, error } = await supabase
      .from("expenses")
      .update({
        paid_at: nextPaidAt,
        status: nextStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", expense.id)
      .select("*")
      .single();
    if (error) setNotice(error.message);
    else if (data) await loadExpenses();
  }

  async function deleteExpense(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) setNotice(error.message);
    else await loadExpenses();
  }

  function openCreateAccountForm() {
    setEditingAccountId(null);
    setAccountForm(createDefaultAccountForm());
    setShowAccountForm(true);
  }

  function closeAccountForm() {
    setEditingAccountId(null);
    setAccountForm(createDefaultAccountForm());
    setShowAccountForm(false);
  }

  function startEditAccount(account: FinancialAccount) {
    setEditingAccountId(account.id);
    setAccountForm({
      name: account.name,
      institution: account.institution ?? "",
      account_type: account.account_type,
      balance: formatGuaraniInput(Number(account.balance ?? 0)),
      credit_limit: formatGuaraniInput(Number(account.credit_limit ?? 0)),
      credit_used: formatGuaraniInput(Number(account.credit_used ?? 0)),
      statement_day: account.statement_day ? String(account.statement_day) : "",
      due_day: account.due_day ? String(account.due_day) : "",
      notes: account.notes ?? ""
    });
    setShowAccountForm(true);
  }

  async function saveAccount(event: React.FormEvent) {
    event.preventDefault();
    setSavingAccount(true);
    setNotice("");

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? session?.user.id;

      if (userError || !userId) {
        setNotice("Tu sesion no esta activa. Cerra sesion y volve a entrar.");
        return;
      }

      if (!accountForm.name.trim()) {
        setNotice("Completa el nombre de la cuenta o tarjeta.");
        return;
      }

      const isCredit = accountForm.account_type === "credit_card" || accountForm.account_type === "debt";
      const payload = {
        user_id: userId,
        name: accountForm.name.trim(),
        institution: accountForm.institution.trim() || null,
        account_type: accountForm.account_type,
        balance: isCredit ? 0 : parseGuaraniAmount(accountForm.balance),
        credit_limit: isCredit ? parseGuaraniAmount(accountForm.credit_limit) : 0,
        credit_used: isCredit ? parseGuaraniAmount(accountForm.credit_used) : 0,
        statement_day: isCredit && accountForm.statement_day ? Number(accountForm.statement_day) : null,
        due_day: isCredit && accountForm.due_day ? Number(accountForm.due_day) : null,
        notes: accountForm.notes.trim() || null,
        updated_at: new Date().toISOString()
      };

      const result = editingAccountId
        ? await supabase.from("financial_accounts").update(payload).eq("id", editingAccountId).select("*").single()
        : await supabase.from("financial_accounts").insert(payload).select("*").single();

      if (result.error) {
        setNotice(`No se pudo guardar la cuenta: ${result.error.message}`);
        return;
      }

      await loadAccounts();
      closeAccountForm();
      setNotice(editingAccountId ? "Cuenta actualizada." : "Cuenta agregada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar la cuenta.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function deleteAccount(id: string) {
    const { error } = await supabase.from("financial_accounts").delete().eq("id", id);
    if (error) setNotice(error.message);
    else await loadAccounts();
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotice("Este navegador no soporta notificaciones web.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotice(permission === "granted" ? "Notificaciones habilitadas en este dispositivo." : "Permiso no concedido.");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/auth");
  }

  const nextExpenses = periodExpenses
    .filter((expense) => {
      if (getTransactionType(expense) === "income") return false;
      const computed = getComputedStatus(expense);
      return computed === "due_today" || computed === "upcoming" || computed === "overdue";
    })
    .slice(0, activeView === "alertas" ? 20 : 5);
  const hasPaymentAlerts = overdueCount > 0 || dueTodayCount > 0 || summary.upcoming > 0;
  const showMoneyDashboard = activeView !== "balances" && activeView !== "cuentas";

  const viewCopy = {
    panel: "Situacion completa del periodo seleccionado.",
    cuentas: "Bancos, efectivo, ahorros, tarjetas y patrimonio neto.",
    balances: "Cierre automatico por mes y comparacion mensual.",
    vencimientos: "Gestiona tus pagos, estados y fechas.",
    alertas: "Prioridad de vencimientos cercanos o atrasados."
  };

  return (
    <main className="executive-shell">
      <aside className="executive-sidebar">
        <div className="brand-lockup">
            <span>MG</span>
          <div>
            <strong>Mi Balance</strong>
            <small>Finanzas personales</small>
          </div>
        </div>
        <nav className="side-nav" aria-label="Principal">
          <button className={activeView === "panel" ? "active" : ""} onClick={() => setActiveView("panel")} type="button">
            <WalletCards size={18} /> Panel ejecutivo
          </button>
          <button className={activeView === "cuentas" ? "active" : ""} onClick={() => setActiveView("cuentas")} type="button">
            <CircleDollarSign size={18} /> Cuentas
          </button>
          <button className={activeView === "balances" ? "active" : ""} onClick={() => setActiveView("balances")} type="button">
            <BarChart3 size={18} /> Balances
          </button>
          <button className={activeView === "vencimientos" ? "active" : ""} onClick={() => setActiveView("vencimientos")} type="button">
            <CalendarDays size={18} /> Vencimientos
          </button>
          <button className={activeView === "alertas" ? "active" : ""} onClick={() => setActiveView("alertas")} type="button">
            <AlertTriangle size={18} /> Alertas
          </button>
        </nav>
        <div className="side-account">
          <small>Cuenta</small>
          <strong>{session?.user.email}</strong>
          <button onClick={logout} type="button"><LogOut size={16} /> Salir</button>
        </div>
      </aside>

      <section className="executive-main">
        <header className="executive-topbar">
          <div>
            <p className="eyebrow">Panel ejecutivo</p>
            <h1>Situacion del mes</h1>
            <span className="view-subtitle">{viewCopy[activeView]}</span>
          </div>
          <div className="executive-actions">
            <button className="icon-button" onClick={enableNotifications} title="Activar notificaciones" type="button">
              <Bell size={20} />
            </button>
            <button className="executive-primary" onClick={openCreateForm} type="button">
              <Plus size={18} /> Agregar movimiento
            </button>
          </div>
        </header>

        {showMoneyDashboard ? (
        <>
        <section className="executive-overview" id="resumen">
          <article className={`executive-balance ${balanceTone}`}>
            <div className="balance-copy">
              <span>Balance disponible</span>
              <strong>{formatCurrency(balance)}</strong>
            </div>
            <div className="balance-detail-grid">
              <span>
                <small>Ingresos</small>
                <b>{formatCurrency(summary.income)}</b>
              </span>
              <span>
                <small>Gastos</small>
                <b>{formatCurrency(summary.expenses)}</b>
              </span>
              <span>
                <small>Movimientos</small>
                <b>{periodExpenses.length} / {expenses.length}</b>
              </span>
            </div>
            <div className={`balance-health ${balanceTone}`}>
              <small>Estado</small>
              <b>{healthLabel}</b>
              <p>{healthCopy}</p>
              <span>{spendingRatio}% usado / {savingRate}% ahorro</span>
            </div>
          </article>
        </section>

        <section className="executive-kpis" aria-label="Indicadores principales">
          <article className="executive-metric paid">
            <CircleDollarSign size={20} />
            <span>Ingresos</span>
            <strong>{formatCurrency(summary.income)}</strong>
          </article>
          <article className="executive-metric fixed">
            <WalletCards size={20} />
            <span>Gastos fijos</span>
            <strong>{formatCurrency(summary.fixed)}</strong>
          </article>
          <article className="executive-metric variable">
            <WalletCards size={20} />
            <span>Gastos variables</span>
            <strong>{formatCurrency(summary.variable)}</strong>
          </article>
          <article className="executive-metric upcoming">
            <CalendarDays size={20} />
            <span>Proximos pagos</span>
            <strong>{summary.upcoming}</strong>
          </article>
          <article className="executive-metric overdue">
            <AlertTriangle size={20} />
            <span>Vencidos</span>
            <strong>{overdueCount}</strong>
          </article>
        </section>

        <section className="executive-filters">
          <label>
            Mes
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="all">Todos los meses</option>
              <option value={new Date().toISOString().slice(0, 7)}>Mes actual</option>
              {Array.from(new Set(expenses.map((expense) => expense.due_date.slice(0, 7)))).map((item) => (
                <option key={item} value={item}>
                  {new Date(`${item}-01T00:00:00`).toLocaleDateString("es-PY", {
                    month: "long",
                    year: "numeric"
                  })}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select value={transactionFilter} onChange={(event) => setTransactionFilter(event.target.value as "all" | "expense" | "income")}>
              <option value="all">Todos</option>
              <option value="expense">Gastos</option>
              <option value="income">Ingresos</option>
            </select>
          </label>
          <label>
            Clase
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as "all" | "fixed" | "variable")}>
              <option value="all">Todas</option>
              <option value="fixed">Gastos fijos</option>
              <option value="variable">Gastos variables</option>
            </select>
          </label>
          <label>
            Categoria
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">Todas</option>
              {[...categories, ...incomeCategories].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </section>
        </>
        ) : null}

        {notice ? <p className="notice executive-notice">{notice}</p> : null}

        {activeView === "cuentas" ? (
          <section className="accounts-view" aria-label="Cuentas y tarjetas">
            <section className="accounts-summary-grid">
              <article className="executive-card account-summary-card">
                <span>Disponible real</span>
                <strong>{formatCurrency(accountsSummary.available)}</strong>
              </article>
              <article className="executive-card account-summary-card">
                <span>Inversiones</span>
                <strong>{formatCurrency(accountsSummary.investments)}</strong>
              </article>
              <article className="executive-card account-summary-card debt">
                <span>Deuda tarjetas</span>
                <strong>{formatCurrency(accountsSummary.creditUsed)}</strong>
              </article>
              <article className="executive-card account-summary-card">
                <span>Credito disponible</span>
                <strong>{formatCurrency(accountsSummary.availableCredit)}</strong>
              </article>
              <article className={`executive-card account-summary-card ${netWorth >= 0 ? "positive" : "negative"}`}>
                <span>Patrimonio neto</span>
                <strong>{formatCurrency(netWorth)}</strong>
              </article>
            </section>

            <section className="accounts-layout">
              <article className="executive-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">Plata real</p>
                    <h2>Bancos y ahorros</h2>
                  </div>
                  <button className="small-action" onClick={openCreateAccountForm} type="button"><Plus size={16} /> Nueva</button>
                </div>
                <div className="account-list">
                  {assetAccounts.length === 0 ? <p className="empty-side">Agrega tus bancos, efectivo o ahorros.</p> : null}
                  {accountSnapshots.filter((item) => !isCreditAccount(item.account)).map((item) => (
                    <article className="account-row" key={item.account.id}>
                      <div>
                        <strong>{item.account.name}</strong>
                        <span>{accountTypeLabels[item.account.account_type]}{item.account.institution ? ` / ${item.account.institution}` : ""}</span>
                      </div>
                      <b>{formatCurrency(item.balance)}</b>
                      <div className="row-actions">
                        <button className="icon-button" onClick={() => startEditAccount(item.account)} title="Editar" type="button"><Edit2 size={18} /></button>
                        <button className="icon-button danger" onClick={() => deleteAccount(item.account.id)} title="Eliminar" type="button"><Trash2 size={18} /></button>
                      </div>
                    </article>
                  ))}
                </div>
              </article>

              <article className="executive-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">Credito</p>
                    <h2>Tarjetas y deudas</h2>
                  </div>
                  <button className="small-action" onClick={openCreateAccountForm} type="button"><Plus size={16} /> Nueva</button>
                </div>
                <div className="account-list">
                  {creditAccounts.length === 0 ? <p className="empty-side">Agrega tus tarjetas de credito o deudas.</p> : null}
                  {accountSnapshots.filter((item) => isCreditAccount(item.account)).map((item) => (
                    <article className="account-row credit" key={item.account.id}>
                      <div>
                        <strong>{item.account.name}</strong>
                        <span>{accountTypeLabels[item.account.account_type]}{item.account.institution ? ` / ${item.account.institution}` : ""}</span>
                        <small>Vence dia {item.account.due_day ?? "-"} / Cierra dia {item.account.statement_day ?? "-"}</small>
                      </div>
                      <div className="credit-values">
                        <b>{formatCurrency(item.debt)}</b>
                        <span>Disponible {formatCurrency(item.availableCredit)}</span>
                      </div>
                      <div className="row-actions">
                        <button className="icon-button" onClick={() => startEditAccount(item.account)} title="Editar" type="button"><Edit2 size={18} /></button>
                        <button className="icon-button danger" onClick={() => deleteAccount(item.account.id)} title="Eliminar" type="button"><Trash2 size={18} /></button>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            </section>
          </section>
        ) : null}

        {activeView === "balances" ? (
          <section className="balances-view" aria-label="Balances mensuales">
            <div className="balance-period-grid">
              {[currentReport, previousReport].map((report, index) => (
                <article className={`executive-card month-close-card ${report.balance >= 0 ? "positive" : "negative"}`} key={report.month}>
                  <div className="card-heading">
                    <div>
                      <p className="eyebrow">{index === 0 ? "Mes actual" : "Mes anterior"}</p>
                      <h2>{getMonthLabel(report.month)}</h2>
                    </div>
                    <span className="close-status">{getReportStatus(report.balance)}</span>
                  </div>
                  <strong className={report.balance >= 0 ? "positive-amount" : "negative-amount"}>
                    {formatCurrency(report.balance)}
                  </strong>
                  <div className="month-close-details">
                    <span><small>Ingresos</small><b>{formatCurrency(report.income)}</b></span>
                    <span><small>Gastos fijos</small><b>{formatCurrency(report.fixed)}</b></span>
                    <span><small>Gastos variables</small><b>{formatCurrency(report.variable)}</b></span>
                    <span><small>Total gastado</small><b>{formatCurrency(report.expenses)}</b></span>
                  </div>
                </article>
              ))}
            </div>

            <article className="executive-card comparison-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Comparacion</p>
                  <h2>Actual vs anterior</h2>
                </div>
              </div>
              <div className="comparison-grid">
                <span>
                  <small>Diferencia de ingresos</small>
                  <b className={reportDelta.income >= 0 ? "positive-amount" : "negative-amount"}>{formatCurrency(reportDelta.income)}</b>
                </span>
                <span>
                  <small>Diferencia de gastos</small>
                  <b className={reportDelta.expenses <= 0 ? "positive-amount" : "negative-amount"}>{formatCurrency(reportDelta.expenses)}</b>
                </span>
                <span>
                  <small>Diferencia de balance</small>
                  <b className={reportDelta.balance >= 0 ? "positive-amount" : "negative-amount"}>{formatCurrency(reportDelta.balance)}</b>
                </span>
              </div>
            </article>

            <article className="executive-card monthly-history-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Historial</p>
                  <h2>Cierres mensuales</h2>
                </div>
              </div>
              {monthlyReports.length === 0 ? (
                <p className="empty-state">Todavia no hay movimientos para calcular balances mensuales.</p>
              ) : (
                <div className="monthly-history">
                  {monthlyReports.map((report) => (
                    <div className="monthly-history-row" key={report.month}>
                      <strong>{getMonthLabel(report.month)}</strong>
                      <span>{report.movements} movimientos</span>
                      <span>{formatCurrency(report.income)} ingresos</span>
                      <span>{formatCurrency(report.expenses)} gastos</span>
                      <b className={report.balance >= 0 ? "positive-amount" : "negative-amount"}>{formatCurrency(report.balance)}</b>
                      <em>{getReportStatus(report.balance)}</em>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeView === "panel" ? (
          <section className="finance-insights" aria-label="Analisis financiero">
            <article className="executive-card insight-card split-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Composicion</p>
                  <h2>Fijos vs variables</h2>
                </div>
                <PieChart size={20} />
              </div>
              <div className="donut-layout">
                <div
                  className={`expense-donut ${totalExpenseKinds === 0 ? "empty" : ""}`}
                  style={{ background: totalExpenseKinds === 0 ? "#e8eef5" : `conic-gradient(#0f766e 0 ${fixedPercent}%, #2563eb ${fixedPercent}% 100%)` }}
                  aria-label={`${fixedPercent}% gastos fijos y ${variablePercent}% gastos variables`}
                >
                  <span>{totalExpenseKinds === 0 ? "0" : `${variablePercent}%`}</span>
                  <small>{totalExpenseKinds === 0 ? "sin gastos" : "variable"}</small>
                </div>
                <div className="chart-legend">
                  <div>
                    <span className="legend-dot fixed-dot" />
                    <p>Gastos fijos</p>
                    <strong>{formatCurrency(summary.fixed)}</strong>
                  </div>
                  <div>
                    <span className="legend-dot variable-dot" />
                    <p>Gastos variables</p>
                    <strong>{formatCurrency(summary.variable)}</strong>
                  </div>
                </div>
              </div>
            </article>

            <article className="executive-card insight-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Flujo</p>
                  <h2>Ingresos vs gastos</h2>
                </div>
                <BarChart3 size={20} />
              </div>
              <div className="cashflow-bars">
                <div>
                  <span>Ingresos</span>
                  <div className="bar-track">
                    <b className="income-bar" style={{ width: `${Math.max((summary.income / cashflowMax) * 100, summary.income ? 8 : 0)}%` }} />
                  </div>
                  <strong>{formatCurrency(summary.income)}</strong>
                </div>
                <div>
                  <span>Gastos</span>
                  <div className="bar-track">
                    <b className="expense-bar" style={{ width: `${Math.max((summary.expenses / cashflowMax) * 100, summary.expenses ? 8 : 0)}%` }} />
                  </div>
                  <strong>{formatCurrency(summary.expenses)}</strong>
                </div>
                <div>
                  <span>Resultado</span>
                  <div className="bar-track">
                    <b className={balance >= 0 ? "income-bar" : "danger-bar"} style={{ width: `${Math.max((Math.abs(balance) / cashflowMax) * 100, balance ? 8 : 0)}%` }} />
                  </div>
                  <strong className={balance >= 0 ? "positive-amount" : "negative-amount"}>{formatCurrency(balance)}</strong>
                </div>
              </div>
            </article>

            <article className="executive-card insight-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Categorias</p>
                  <h2>Mayores gastos</h2>
                </div>
                <TrendingUp size={20} />
              </div>
              <div className="category-bars">
                {categoryBreakdown.length === 0 ? <p className="empty-side">Sin gastos para graficar.</p> : null}
                {categoryBreakdown.map((item) => (
                  <div key={item.name}>
                    <span>{item.name}</span>
                    <div className="bar-track">
                      <b style={{ width: `${Math.max((item.amount / maxCategoryAmount) * 100, 8)}%` }} />
                    </div>
                    <strong>{formatCurrency(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {showMoneyDashboard && hasPaymentAlerts ? (
          <section className={`internal-alert ${overdueCount > 0 ? "danger" : dueTodayCount > 0 ? "today" : "upcoming"}`}>
            <div>
              <strong>
                {overdueCount > 0
                  ? `Tenes ${overdueCount} pago${overdueCount === 1 ? "" : "s"} vencido${overdueCount === 1 ? "" : "s"}`
                  : dueTodayCount > 0
                    ? `Tenes ${dueTodayCount} pago${dueTodayCount === 1 ? "" : "s"} que vence${dueTodayCount === 1 ? "" : "n"} hoy`
                    : `Tenes ${summary.upcoming} pago${summary.upcoming === 1 ? "" : "s"} proximo${summary.upcoming === 1 ? "" : "s"}`}
              </strong>
              <span>Revisa tus vencimientos para evitar atrasos.</span>
            </div>
            <button onClick={() => setActiveView("alertas")} type="button">
              Ver alertas
            </button>
          </section>
        ) : null}

        {showMoneyDashboard ? (
        <section className={`executive-content view-${activeView}`}>
          {(activeView === "panel" || activeView === "vencimientos") ? (
          <article className="executive-card table-card" id="vencimientos">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Movimientos</p>
                <h2>Movimientos recientes</h2>
              </div>
              <button className="small-action" onClick={openCreateForm} type="button">
                <Plus size={16} /> Nuevo
              </button>
            </div>

            {loading ? <p className="empty-state">Cargando movimientos...</p> : null}
            {!loading && periodExpenses.length === 0 ? (
              <p className="empty-state"><Filter size={18} /> No hay movimientos visibles con estos filtros. Hay {expenses.length} movimientos guardados en total.</p>
            ) : null}

            <div className="executive-table">
              {periodExpenses.map((expense) => {
                const computed = getComputedStatus(expense);
                const transactionType = getTransactionType(expense);
                const expenseKind = getExpenseKind(expense);
                const movementKind = getMovementKind(expense);
                return (
                  <article className={`executive-row ${computed} ${transactionType}`} key={expense.id}>
                    {transactionType === "income" ? (
                      <span className="income-marker"><CircleDollarSign size={18} /></span>
                    ) : (
                      <button className="paid-toggle" onClick={() => togglePaid(expense)} title="Marcar pagado" type="button">
                        <Check size={18} />
                      </button>
                    )}
                    <div className="row-title">
                      <h3>{expense.title}</h3>
                      <span>{transactionType === "income" ? "Ingreso" : movementKind === "card_payment" ? "Pago de tarjeta" : expenseKind === "fixed" ? "Gasto fijo" : "Gasto variable"} / {expense.category}</span>
                    </div>
                    <strong className={transactionType === "income" ? "income-amount" : "expense-amount"}>
                      {transactionType === "income" ? "+" : "-"}{formatCurrency(Number(expense.amount))}
                    </strong>
                    <span>{new Date(`${expense.due_date}T00:00:00`).toLocaleDateString("es-PY")}</span>
                    <div className="row-pills">
                      <span className="status-pill">{transactionType === "income" ? "Ingreso" : movementKind === "card_payment" ? "Pago tarjeta" : statusLabels[computed]}</span>
                      {transactionType === "expense" && movementKind !== "card_payment" ? (
                        <span className="kind-pill">{expenseKind === "fixed" ? "Fijo" : "Variable"}</span>
                      ) : null}
                      {expense.recurrence === "monthly" ? <span className="repeat-pill">Mensual</span> : null}
                    </div>
                    <div className="row-actions">
                      <button className="icon-button" onClick={() => startEdit(expense)} title="Editar" type="button">
                        <Edit2 size={18} />
                      </button>
                      <button className="icon-button danger" onClick={() => deleteExpense(expense.id)} title="Eliminar" type="button">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </article>
          ) : null}

          {(activeView === "panel" || activeView === "alertas") ? (
          <aside className="executive-card right-card" id="alertas">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Prioridad</p>
                <h2>Proximos vencimientos</h2>
              </div>
            </div>
            <div className="due-stack">
              {nextExpenses.length === 0 ? <p className="empty-side">Sin alertas para estos filtros.</p> : null}
              {nextExpenses.map((expense) => {
                const computed = getComputedStatus(expense);
                return (
                  <div className={`due-item ${computed}`} key={expense.id}>
                    <span>{statusLabels[computed]}</span>
                    <strong>{expense.title}</strong>
                    <small>
                      {formatCurrency(Number(expense.amount))} / {new Date(`${expense.due_date}T00:00:00`).toLocaleDateString("es-PY")}
                    </small>
                  </div>
                );
              })}
            </div>
          </aside>
          ) : null}
        </section>
        ) : null}

        {showForm ? (
          <section className="executive-modal" role="dialog" aria-modal="true" aria-label="Formulario de movimiento">
            <div className="executive-form-card" key={editingId ?? "new-movement"}>
              <div className="card-heading">
                <div>
                  <p className="eyebrow">{editingId ? "Actualizacion" : "Nuevo registro"}</p>
                  <h2>{editingId ? "Editar movimiento" : "Agregar movimiento"}</h2>
                </div>
                <button className="icon-button" onClick={closeForm} type="button">
                  <X size={20} />
                </button>
              </div>
              <form className="executive-form" onSubmit={saveExpense} autoComplete="off">
                <label>Tipo<select value={form.transaction_type} onChange={(e) => setForm({ ...form, transaction_type: e.target.value as "expense" | "income", movement_kind: "normal", payment_target_account_id: "", category: e.target.value === "income" ? "Sueldo" : "Servicios" })}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
                {form.transaction_type === "expense" ? (
                  <label>Operacion<select value={form.movement_kind} onChange={(e) => setForm({ ...form, movement_kind: e.target.value as MovementKind })}><option value="normal">Gasto normal</option><option value="card_payment">Pago de tarjeta</option></select></label>
                ) : null}
                {form.transaction_type === "expense" ? (
                  <label>Clase<select value={form.expense_kind} onChange={(e) => setForm({ ...form, expense_kind: e.target.value as ExpenseKind })}><option value="variable">Variable / ocasional</option><option value="fixed">Fijo</option></select></label>
                ) : null}
                <label>{form.movement_kind === "card_payment" ? "Cuenta origen" : "Cuenta / tarjeta"}<select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}><option value="">Sin cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} / {accountTypeLabels[account.account_type]}</option>)}</select></label>
                {form.transaction_type === "expense" && form.movement_kind === "card_payment" ? (
                  <label>Tarjeta destino<select value={form.payment_target_account_id} onChange={(e) => setForm({ ...form, payment_target_account_id: e.target.value })}><option value="">Elegir tarjeta</option>{accounts.filter((account) => isCreditAccount(account)).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                ) : null}
                <label>Nombre<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
                <label>Monto<input autoComplete="off" inputMode="numeric" name="movement_amount" placeholder="0" value={form.amount} onBlur={(e) => setForm({ ...form, amount: formatGuaraniInput(e.target.value) })} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
                <label>Categoria<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{(form.transaction_type === "income" ? incomeCategories : categories).map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>{form.transaction_type === "income" ? "Fecha" : "Vencimiento"}<input value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} type="date" required /></label>
                {form.transaction_type === "expense" ? (
                  <label>Repeticion<select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as "none" | "monthly" })}><option value="none">Unico</option><option value="monthly">Mensual</option></select></label>
                ) : null}
                <label className="full">Notas<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
                <button className="primary-button full" disabled={saving} type="submit">{saving ? "Guardando..." : "Guardar movimiento"}</button>
              </form>
            </div>
          </section>
        ) : null}

        {showAccountForm ? (
          <section className="executive-modal" role="dialog" aria-modal="true" aria-label="Formulario de cuenta">
            <div className="executive-form-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">{editingAccountId ? "Actualizacion" : "Nueva cuenta"}</p>
                  <h2>{editingAccountId ? "Editar cuenta" : "Agregar cuenta o tarjeta"}</h2>
                </div>
                <button className="icon-button" onClick={closeAccountForm} type="button">
                  <X size={20} />
                </button>
              </div>
              <form className="executive-form" onSubmit={saveAccount} autoComplete="off">
                <label>Tipo<select value={accountForm.account_type} onChange={(e) => setAccountForm({ ...accountForm, account_type: e.target.value as FinancialAccountType })}><option value="bank">Banco</option><option value="cash">Efectivo</option><option value="savings">Ahorro</option><option value="investment">Inversion</option><option value="credit_card">Tarjeta de credito</option><option value="debt">Deuda</option></select></label>
                <label>Nombre<input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Ej. Ueno, Visa Itaú" required /></label>
                <label>Banco / entidad<input value={accountForm.institution} onChange={(e) => setAccountForm({ ...accountForm, institution: e.target.value })} placeholder="Opcional" /></label>
                {accountForm.account_type === "credit_card" || accountForm.account_type === "debt" ? (
                  <>
                    <label>Limite<input inputMode="numeric" value={accountForm.credit_limit} onBlur={(e) => setAccountForm({ ...accountForm, credit_limit: formatGuaraniInput(e.target.value) })} onChange={(e) => setAccountForm({ ...accountForm, credit_limit: e.target.value })} placeholder="0" /></label>
                    <label>Deuda actual<input inputMode="numeric" value={accountForm.credit_used} onBlur={(e) => setAccountForm({ ...accountForm, credit_used: formatGuaraniInput(e.target.value) })} onChange={(e) => setAccountForm({ ...accountForm, credit_used: e.target.value })} placeholder="0" /></label>
                    <label>Dia de cierre<input inputMode="numeric" max="31" min="1" type="number" value={accountForm.statement_day} onChange={(e) => setAccountForm({ ...accountForm, statement_day: e.target.value })} /></label>
                    <label>Dia de vencimiento<input inputMode="numeric" max="31" min="1" type="number" value={accountForm.due_day} onChange={(e) => setAccountForm({ ...accountForm, due_day: e.target.value })} /></label>
                  </>
                ) : (
                  <label>Saldo actual<input inputMode="numeric" value={accountForm.balance} onBlur={(e) => setAccountForm({ ...accountForm, balance: formatGuaraniInput(e.target.value) })} onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })} placeholder="0" /></label>
                )}
                <label className="full">Notas<textarea value={accountForm.notes} onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })} rows={3} /></label>
                <button className="primary-button full" disabled={savingAccount} type="submit">{savingAccount ? "Guardando..." : "Guardar cuenta"}</button>
              </form>
            </div>
          </section>
        ) : null}

        <nav className="mobile-nav" aria-label="Navegacion movil">
          <button className={activeView === "panel" ? "active" : ""} onClick={() => setActiveView("panel")} type="button">
            <WalletCards size={18} /> Panel
          </button>
          <button className={activeView === "cuentas" ? "active" : ""} onClick={() => setActiveView("cuentas")} type="button">
            <CircleDollarSign size={18} /> Cuentas
          </button>
          <button className={activeView === "balances" ? "active" : ""} onClick={() => setActiveView("balances")} type="button">
            <BarChart3 size={18} /> Balance
          </button>
          <button className={activeView === "vencimientos" ? "active" : ""} onClick={() => setActiveView("vencimientos")} type="button">
            <CalendarDays size={18} /> Vence
          </button>
          <button onClick={openCreateForm} type="button"><Plus size={18} /> Agregar</button>
          <button className={activeView === "alertas" ? "active" : ""} onClick={() => setActiveView("alertas")} type="button">
            <Bell size={18} /> Alertas
          </button>
        </nav>
      </section>
    </main>
  );
}
