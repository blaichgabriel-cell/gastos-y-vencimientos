export type ExpenseStatus = "pending" | "due_today" | "upcoming" | "overdue" | "paid";
export type ExpenseRecurrence = "none" | "monthly";
export type TransactionType = "expense" | "income";
export type ExpenseKind = "fixed" | "variable";

export type Expense = {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  transaction_type: TransactionType;
  expense_kind: ExpenseKind | null;
  client_token: string | null;
  category: string;
  due_date: string;
  status: ExpenseStatus;
  recurrence: ExpenseRecurrence;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseInput = {
  title: string;
  amount: string;
  transaction_type: TransactionType;
  expense_kind: ExpenseKind;
  category: string;
  due_date: string;
  recurrence: ExpenseRecurrence;
  notes: string;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export function getComputedStatus(expense: Pick<Expense, "due_date" | "paid_at">): ExpenseStatus {
  if (expense.paid_at) return "paid";

  const today = startOfToday();
  const due = new Date(`${expense.due_date}T00:00:00`);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due_today";
  if (diffDays <= 3) return "upcoming";
  return "pending";
}

export const statusLabels: Record<ExpenseStatus, string> = {
  paid: "Pagado",
  due_today: "Vence hoy",
  upcoming: "Proximo",
  overdue: "Vencido",
  pending: "Pendiente"
};

export const categories = [
  "Alquiler",
  "Servicios",
  "Tarjeta",
  "Prestamo",
  "Facultad",
  "Educacion",
  "Internet",
  "Celular",
  "Luz",
  "Agua",
  "Seguro",
  "Impuestos",
  "Supermercado",
  "Combustible",
  "Restaurante",
  "Delivery",
  "Compras",
  "Mascotas",
  "Regalos",
  "Comida",
  "Transporte",
  "Salud",
  "Casa",
  "Suscripciones",
  "Ropa",
  "Ahorro",
  "Inversion",
  "Ocio",
  "Otro"
];

export const incomeCategories = [
  "Sueldo",
  "Honorarios",
  "Ventas",
  "Cobros",
  "Transferencia",
  "Regalo",
  "Intereses",
  "Reembolso",
  "Otro ingreso"
];

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0
  }).format(amount);
}

export function parseGuaraniAmount(value: string) {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

export function formatGuaraniInput(value: string | number) {
  const amount = typeof value === "number" ? value : parseGuaraniAmount(value);
  if (!amount) return "";
  return new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0
  }).format(amount);
}
