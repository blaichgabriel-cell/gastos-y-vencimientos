"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  Edit2,
  Filter,
  LogOut,
  Plus,
  Trash2,
  WalletCards,
  X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  categories,
  Expense,
  ExpenseInput,
  ExpenseStatus,
  formatCurrency,
  getComputedStatus,
  statusLabels
} from "@/lib/expenses";
import { hasSupabaseConfig, supabase } from "@/lib/supabase/client";

const defaultForm: ExpenseInput = {
  title: "",
  amount: 0,
  category: "Servicios",
  due_date: new Date().toISOString().slice(0, 10),
  recurrence: "none",
  notes: ""
};

export function ExpenseApp() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState<"all" | ExpenseStatus>("all");
  const [category, setCategory] = useState("all");
  const [notice, setNotice] = useState("");

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
    setLoading(true);
    const { data, error } = await supabase.from("expenses").select("*").order("due_date", { ascending: true });
    if (error) setNotice(`No se pudieron cargar los gastos: ${error.message}`);
    if (!error && data) setExpenses(data as Expense[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return expenses.filter((expense) => {
      const computed = getComputedStatus(expense);
      return (
        expense.due_date.startsWith(month) &&
        (status === "all" || computed === status) &&
        (category === "all" || expense.category === category)
      );
    });
  }, [expenses, month, status, category]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, expense) => {
        const computed = getComputedStatus(expense);
        if (computed === "paid") acc.paid += Number(expense.amount);
        else acc.pending += Number(expense.amount);
        if (computed === "due_today" || computed === "upcoming") acc.upcoming += 1;
        return acc;
      },
      { pending: 0, paid: 0, upcoming: 0 }
    );
  }, [filtered]);

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    setNotice("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? session?.user.id;

    if (userError || !userId) {
      setNotice("Tu sesion no esta activa. Cerra sesion y volve a entrar.");
      return;
    }

    if (!form.title.trim() || Number(form.amount) <= 0) {
      setNotice("Completa un nombre y un monto mayor a cero.");
      return;
    }

    setSaving(true);

    const payload = {
      ...form,
      title: form.title.trim(),
      amount: Number(form.amount),
      user_id: userId,
      status: "pending" as ExpenseStatus,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString()
    };

    const result = editingId
      ? await supabase.from("expenses").update(payload).eq("id", editingId).select("*").single()
      : await supabase.from("expenses").insert(payload).select("*").single();

    setSaving(false);
    if (result.error) {
      setNotice(`No se pudo guardar: ${result.error.message}`);
      return;
    }

    const savedExpense = result.data as Expense;
    setExpenses((current) => {
      const withoutEdited = current.filter((expense) => expense.id !== savedExpense.id);
      return [...withoutEdited, savedExpense].sort((a, b) => a.due_date.localeCompare(b.due_date));
    });
    setMonth(savedExpense.due_date.slice(0, 7));
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(false);
    setNotice(editingId ? "Gasto actualizado." : "Gasto guardado.");
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id);
    setForm({
      title: expense.title,
      amount: Number(expense.amount),
      category: expense.category,
      due_date: expense.due_date,
      recurrence: expense.recurrence,
      notes: expense.notes ?? ""
    });
    setShowForm(true);
  }

  async function togglePaid(expense: Expense) {
    const isPaid = Boolean(expense.paid_at);
    const { error } = await supabase
      .from("expenses")
      .update({
        paid_at: isPaid ? null : new Date().toISOString(),
        status: isPaid ? "pending" : "paid",
        updated_at: new Date().toISOString()
      })
      .eq("id", expense.id);
    if (error) setNotice(error.message);
    else await loadExpenses();
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

  return (
    <main className="money-shell">
      <header className="money-header">
        <div>
          <p className="eyebrow">Panel mensual</p>
          <h1>Mis gastos</h1>
          <span>{session?.user.email}</span>
        </div>
        <div className="money-actions">
          <button className="icon-button" onClick={enableNotifications} title="Activar notificaciones" type="button">
            <Bell size={20} />
          </button>
          <button className="icon-button" onClick={logout} title="Cerrar sesion" type="button">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <section className="money-hero">
        <div>
          <span>Total pendiente</span>
          <strong>{formatCurrency(summary.pending)}</strong>
          <small>{filtered.length} movimientos en el mes seleccionado</small>
        </div>
        <button className="hero-add" onClick={() => setShowForm(true)} type="button">
          <Plus size={20} /> Nuevo gasto
        </button>
      </section>

      <section className="metric-row">
        <article>
          <WalletCards size={20} />
          <span>Pagado</span>
          <strong>{formatCurrency(summary.paid)}</strong>
        </article>
        <article>
          <CalendarDays size={20} />
          <span>Por vencer</span>
          <strong>{summary.upcoming}</strong>
        </article>
        <article>
          <AlertTriangle size={20} />
          <span>Vencidos</span>
          <strong>{filtered.filter((expense) => getComputedStatus(expense) === "overdue").length}</strong>
        </article>
      </section>

      <section className="control-panel">
        <label>
          Mes
          <input value={month} onChange={(event) => setMonth(event.target.value)} type="month" />
        </label>
        <label>
          Estado
          <select value={status} onChange={(event) => setStatus(event.target.value as "all" | ExpenseStatus)}>
            <option value="all">Todos</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">Todas</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </section>

      {showForm ? (
        <section className="form-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">{editingId ? "Actualizacion" : "Carga rapida"}</p>
              <h2>{editingId ? "Editar gasto" : "Nuevo gasto"}</h2>
            </div>
            <button className="icon-button" onClick={() => setShowForm(false)} type="button">
              <X size={20} />
            </button>
          </div>
          <form className="expense-form refined" onSubmit={saveExpense}>
            <label>
              Nombre
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label>
              Monto
              <input
                value={form.amount || ""}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                min="1"
                type="number"
                required
              />
            </label>
            <label>
              Categoria
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Vencimiento
              <input
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                type="date"
                required
              />
            </label>
            <label>
              Repeticion
              <select
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value as "none" | "monthly" })}
              >
                <option value="none">Unico</option>
                <option value="monthly">Mensual</option>
              </select>
            </label>
            <label className="full">
              Notas
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </label>
            <button className="primary-button full" disabled={saving} type="submit">
              {saving ? "Guardando..." : "Guardar gasto"}
            </button>
          </form>
        </section>
      ) : null}

      {notice ? <p className="notice">{notice}</p> : null}

      <section className="list-panel" aria-live="polite">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Movimientos</p>
            <h2>Vencimientos</h2>
          </div>
          <button className="small-action" onClick={() => setShowForm(true)} type="button">
            <Plus size={16} /> Agregar
          </button>
        </div>

        {loading ? <p className="empty-state">Cargando gastos...</p> : null}
        {!loading && filtered.length === 0 ? (
          <p className="empty-state">
            <Filter size={18} /> No hay gastos con estos filtros.
          </p>
        ) : null}

        <div className="expense-stack">
          {filtered.map((expense) => {
            const computed = getComputedStatus(expense);
            return (
              <article className={`money-item ${computed}`} key={expense.id}>
                <button className="paid-toggle" onClick={() => togglePaid(expense)} title="Marcar pagado" type="button">
                  <Check size={18} />
                </button>
                <div className="money-info">
                  <div>
                    <h3>{expense.title}</h3>
                    <span>
                      {expense.category} / {new Date(`${expense.due_date}T00:00:00`).toLocaleDateString("es-PY")}
                    </span>
                  </div>
                  <strong>{formatCurrency(Number(expense.amount))}</strong>
                </div>
                <div className="money-meta">
                  <span className="status-pill">{statusLabels[computed]}</span>
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
      </section>
    </main>
  );
}
