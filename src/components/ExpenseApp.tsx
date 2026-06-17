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
  formatCurrency,
  getComputedStatus,
  incomeCategories,
  statusLabels
} from "@/lib/expenses";
import { hasSupabaseConfig, supabase } from "@/lib/supabase/client";

type ExpenseForm = {
  title: string;
  amount: string;
  transaction_type: "expense" | "income";
  expense_kind: ExpenseKind;
  client_token: string;
  category: string;
  due_date: string;
  recurrence: "none" | "monthly";
  notes: string;
};

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
  const [form, setForm] = useState<ExpenseForm>(() => createDefaultForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [month, setMonth] = useState("all");
  const [transactionFilter, setTransactionFilter] = useState<"all" | "expense" | "income">("all");
  const [kindFilter, setKindFilter] = useState<"all" | "fixed" | "variable">("all");
  const [category, setCategory] = useState("all");
  const [notice, setNotice] = useState("");
  const [activeView, setActiveView] = useState<"panel" | "balances" | "vencimientos" | "alertas">("panel");
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

  const viewCopy = {
    panel: "Situacion completa del periodo seleccionado.",
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

        {activeView !== "balances" ? (
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

        {activeView !== "balances" && hasPaymentAlerts ? (
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

        {activeView !== "balances" ? (
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
                      <span>{transactionType === "income" ? "Ingreso" : expenseKind === "fixed" ? "Gasto fijo" : "Gasto variable"} / {expense.category}</span>
                    </div>
                    <strong className={transactionType === "income" ? "income-amount" : "expense-amount"}>
                      {transactionType === "income" ? "+" : "-"}{formatCurrency(Number(expense.amount))}
                    </strong>
                    <span>{new Date(`${expense.due_date}T00:00:00`).toLocaleDateString("es-PY")}</span>
                    <div className="row-pills">
                      <span className="status-pill">{transactionType === "income" ? "Ingreso" : statusLabels[computed]}</span>
                      {transactionType === "expense" ? (
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
                <label>Tipo<select value={form.transaction_type} onChange={(e) => setForm({ ...form, transaction_type: e.target.value as "expense" | "income", category: e.target.value === "income" ? "Sueldo" : "Servicios" })}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
                {form.transaction_type === "expense" ? (
                  <label>Clase<select value={form.expense_kind} onChange={(e) => setForm({ ...form, expense_kind: e.target.value as ExpenseKind })}><option value="variable">Variable / ocasional</option><option value="fixed">Fijo</option></select></label>
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

        <nav className="mobile-nav" aria-label="Navegacion movil">
          <button className={activeView === "panel" ? "active" : ""} onClick={() => setActiveView("panel")} type="button">
            <WalletCards size={18} /> Panel
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
