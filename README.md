# Gastos y Vencimientos

App web mobile-first para controlar gastos, fechas de vencimiento y pagos por usuario. Está preparada para Next.js, Supabase, Vercel, PWA y futuras notificaciones push.

## Stack

- Next.js App Router + React
- Supabase Auth y Postgres
- Row Level Security para separar datos por usuario
- PWA con manifest y service worker
- Vercel para deploy

## Configuracion local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env.local` desde `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

3. En Supabase, abre SQL Editor y ejecuta `supabase/schema.sql`.

4. Inicia el proyecto:

```bash
npm run dev
```

## Deploy

1. Sube este proyecto a GitHub.
2. Crea un proyecto en Vercel importando el repo.
3. Agrega las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. En Supabase Auth, agrega las URLs de Vercel en Authentication > URL Configuration.

## Notificaciones push

La PWA ya registra un service worker y pide permiso de notificaciones desde el dashboard. El siguiente paso es implementar Web Push completo:

- Generar VAPID keys.
- Guardar subscriptions reales en `push_subscriptions`.
- Crear una API route segura para registrar la subscription del usuario.
- Programar un cron diario en Vercel que consulte vencimientos y envie avisos.
- Usar email como respaldo si iOS o permisos del navegador bloquean push.
