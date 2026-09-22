# Spazio Classe · Cotizador

Cotizador interno de Spazio Classe — inventario de lujo (candiles, celosías, espejos) colocado en salones de eventos bajo mensualidad fija. Negocio hermano de Spazio Luce, backend independiente.

**En vivo:** https://spazio-classe-programa.netlify.app

## Cómo funciona

- Elige un paquete de arranque (Luxury, Gold, Bronce, Diamante) o arma uno desde cero — sus piezas caen en una tabla editable con las columnas del catálogo original (Clave, Producto, Descripción, Cantidad, Valor unitario, Subtotal).
- La mensualidad se calcula sola: valor total del paquete × 5% (Año 1) y × 3% (Año 2 en adelante), ambos porcentajes ajustables por cotización.
- Cualquier combinación se puede guardar como paquete nuevo reutilizable.
- Cada cotización generada queda en el Historial, con botón para reabrirla y volver a descargarla (PDF / WhatsApp / correo) cuantas veces haga falta.

## Estructura

- `index.html` / `css/styles.css` — la app (mismo look que el Sistema de Gestión de Spazio Luce: fondo casi negro, acento dorado).
- `js/catalog.js` — catálogo de 102 piezas y los 4 paquetes de arranque, transcritos de la lista de precios original.
- `js/app.js` — lógica: login, cotizador, historial, dashboard.

## Backend

Supabase, proyecto **SPAZIO CLASSE** (independiente del de Spazio Luce). Tablas: `clientes` (salones), `paquetes`, `cotizaciones`, `app_users` (lista blanca de correos con acceso).

**Acceso:** Supabase Auth real (correo + contraseña) — solo entra quien tenga sesión y su correo esté en `app_users`. No hay señales de acceso sin cuenta: quien quiera entrar por primera vez usa "¿Primera vez? Crear tu cuenta" en la pantalla de login, con un correo ya autorizado.

## Deploy

Netlify, vía `netlify deploy` apuntando a esta carpeta como raíz (sin build step — es HTML/CSS/JS plano).
