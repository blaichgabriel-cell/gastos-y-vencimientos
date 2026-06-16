import Link from "next/link";
import { ArrowRight, Bell, ShieldCheck, Smartphone } from "lucide-react";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">Gastos y vencimientos</p>
          <h1>Una app simple para no olvidarte de pagar.</h1>
          <p>
            Carga tus gastos, controla el mes, marca pagos y prepara avisos para el celular antes de cada vencimiento.
          </p>
          <Link className="primary-link" href="/auth">
            Entrar a mi cuenta <ArrowRight size={18} />
          </Link>
        </div>
        <div className="phone-preview" aria-hidden="true">
          <div className="phone-top" />
          <div className="preview-card urgent">
            <span>Vence hoy</span>
            <strong>Tarjeta</strong>
            <small>Gs. 1.250.000</small>
          </div>
          <div className="preview-row">
            <span>Alquiler</span>
            <b>Pagado</b>
          </div>
          <div className="preview-row">
            <span>Internet</span>
            <b>Proximo</b>
          </div>
          <div className="preview-total">Pendiente: Gs. 1.680.000</div>
        </div>
      </section>
      <section className="feature-strip">
        <div><Smartphone /> Mobile-first y PWA</div>
        <div><ShieldCheck /> Datos privados por usuario</div>
        <div><Bell /> Lista para notificaciones</div>
      </section>
    </main>
  );
}
