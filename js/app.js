let currentUser = null;

// Conexión a Supabase: salones, paquetes y cotizaciones se guardan aquí,
// compartidos entre todos los que usan el sistema. Proyecto independiente del
// de Spazio Luce (SPAZIO CLASSE, negocio de colocación de inventario en renta).
// Acceso real protegido por Supabase Auth + lista blanca de correos (tabla
// app_users) — el anon key por sí solo ya no puede leer ni escribir nada en
// clientes/paquetes/cotizaciones desde que se activó esa RLS.
const SUPABASE_URL = 'https://czjxenexrkcqgmsvhbob.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6anhlbmV4cmtjcWdtc3ZoYm9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2Nzg3OTksImV4cCI6MjEwMzI1NDc5OX0.hZcaxKXmY1I-rLW6V5OOFBNTTCpYZO315SMpOHppXVY';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentAccessToken = null;

function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + (currentAccessToken || SUPABASE_ANON_KEY),
  }, extra || {});
}

async function sbSelect(table, order) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*${order ? '&order=' + order : ''}`, {
      headers: sbHeaders(),
    });
    if (!res.ok) throw new Error('select failed');
    return await res.json();
  } catch (e) {
    console.error('Supabase select error', e);
    return [];
  }
}

async function sbInsert(table, row) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error('insert failed');
    return await res.json();
  } catch (e) {
    console.error('Supabase insert error', e);
    return null;
  }
}

async function sbDelete(table, id) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers: sbHeaders(),
    });
    if (!res.ok) throw new Error('delete failed');
    return true;
  } catch (e) {
    console.error('Supabase delete error', e);
    return false;
  }
}

async function sbUpdate(table, id, patch) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('update failed');
    return true;
  } catch (e) {
    console.error('Supabase update error', e);
    return false;
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ESTATUS_OPTIONS = ['Enviada', 'En revisión', 'Aprobada', 'Rechazada'];
function pillClassFor(estatus) {
  const map = { 'Enviada': 'pill-enviada', 'En revisión': 'pill-revision', 'Aprobada': 'pill-aprobada', 'Rechazada': 'pill-rechazada' };
  return map[estatus] || 'pill-enviada';
}
function estatusSelectHtml(c) {
  const cur = c.estatus || 'Enviada';
  const opts = ESTATUS_OPTIONS.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
  return `<select class="estatus-select ${pillClassFor(cur)}" onchange="updateQuoteEstatus(${c.id}, this.value)">${opts}</select>`;
}
async function updateQuoteEstatus(id, estatus) {
  const ok = await sbUpdate('cotizaciones', id, { estatus });
  if (ok) { showToast('Estatus actualizado a "' + estatus + '"'); await refreshAll(); }
  else showToast('No se pudo actualizar el estatus');
}

// ---------- Login (Supabase Auth real + lista blanca app_users) ----------
let signupMode = false;
function toggleSignupMode() {
  signupMode = !signupMode;
  document.getElementById('authTitle').textContent = signupMode ? 'Crear cuenta' : 'Iniciar sesión';
  document.getElementById('authSub').textContent = signupMode
    ? 'Solo para los correos autorizados de Spazio Classe'
    : 'Cotizador interno · Spazio Classe';
  document.getElementById('authSubmitBtn').textContent = signupMode ? 'Crear cuenta' : 'Entrar';
  document.getElementById('toggleSignupBtn').textContent = signupMode
    ? '¿Ya tienes cuenta? Inicia sesión'
    : '¿Primera vez? Crear tu cuenta';
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('loginError').style.color = '';
}
async function handleAuthSubmit() {
  if (signupMode) await handleSignup();
  else await handleLogin();
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('currentUserLabel').textContent = currentUser.email;
}

async function handleLogin() {
  const email = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errBox = document.getElementById('loginError');
  errBox.classList.add('hidden');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  if (error || !data.session) {
    errBox.textContent = 'Correo o contraseña incorrectos.';
    errBox.classList.remove('hidden');
    return;
  }
  currentAccessToken = data.session.access_token;
  currentUser = { email: data.user.email };
  showApp();
  await refreshAll();
}

async function handleSignup() {
  const email = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errBox = document.getElementById('loginError');
  errBox.classList.add('hidden');
  if (!email || pass.length < 6) {
    errBox.textContent = 'Escribe tu correo y una contraseña de al menos 6 caracteres.';
    errBox.classList.remove('hidden');
    return;
  }
  const { data, error } = await supabaseClient.auth.signUp({ email, password: pass });
  if (error) {
    errBox.textContent = error.message;
    errBox.classList.remove('hidden');
    return;
  }
  if (data.session) {
    currentAccessToken = data.session.access_token;
    currentUser = { email: data.user.email };
    showApp();
    await refreshAll();
  } else {
    errBox.classList.remove('hidden');
    errBox.style.color = 'var(--green)';
    errBox.textContent = 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.';
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentAccessToken = null;
  currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

// ---------- Navegación ----------
function showView(view) {
  ['dashboard', 'salones', 'cotizador', 'historial', 'reportes', 'recibo'].forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  if (view === 'cotizador') prepareCotizador();
  if (view === 'dashboard' || view === 'salones' || view === 'historial' || view === 'reportes') refreshAll();
}

async function refreshAll() {
  const [salones, cotizaciones] = await Promise.all([
    sbSelect('clientes', 'created_at.desc'),
    sbSelect('cotizaciones', 'fecha.desc'),
  ]);
  window.__salones = salones;
  window.__cotizaciones = cotizaciones;
  renderDashboard(salones, cotizaciones);
  renderSalonesTable(salones, cotizaciones);
  renderHistorialTable(cotizaciones);
  renderReportes(cotizaciones);
}

function renderReportes(cotizaciones) {
  const grid = document.getElementById('reportesStatsGrid');
  if (!grid) return;

  const total = cotizaciones.length;
  const valorTotal = cotizaciones.reduce((s, c) => s + Number(c.valor_total || 0), 0);
  const mensualidadA1Total = cotizaciones.reduce((s, c) => s + Number(c.mensualidad_anio1 || 0), 0);
  const mensualidadA2Total = cotizaciones.reduce((s, c) => s + Number(c.mensualidad_anio2 || 0), 0);
  const ticketProm = total ? valorTotal / total : 0;

  grid.innerHTML = `
    <div class="stat-card"><div class="label">Cotizaciones generadas</div><div class="value">${total}</div></div>
    <div class="stat-card"><div class="label">Mensualidad Año 1 (suma)</div><div class="value">${money(mensualidadA1Total)}</div></div>
    <div class="stat-card"><div class="label">Mensualidad Año 2+ (suma)</div><div class="value">${money(mensualidadA2Total)}</div></div>
    <div class="stat-card"><div class="label">Ticket promedio (valor)</div><div class="value">${money(ticketProm)}</div></div>
  `;

  // Cotizaciones por estatus
  const estatusColor = { 'Enviada': 'var(--blue)', 'En revisión': 'var(--gold)', 'Aprobada': 'var(--green)', 'Rechazada': 'var(--red)' };
  const estatusCounts = {};
  ESTATUS_OPTIONS.forEach(e => { estatusCounts[e] = 0; });
  cotizaciones.forEach(c => {
    const e = c.estatus || 'Enviada';
    estatusCounts[e] = (estatusCounts[e] || 0) + 1;
  });
  const estatusEl = document.getElementById('reportesEstatusList');
  if (!total) {
    estatusEl.innerHTML = '<div class="empty-state">Aún no hay cotizaciones generadas.</div>';
  } else {
    estatusEl.innerHTML = ESTATUS_OPTIONS.map(e => {
      const count = estatusCounts[e] || 0;
      const pct = total ? Math.round((count / total) * 100) : 0;
      return `
        <div class="report-bar-row">
          <div class="report-bar-head"><span class="name">${escapeHtml(e)}</span><span class="count">${count} · ${pct}%</span></div>
          <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%;background:${estatusColor[e] || 'var(--gold)'}"></div></div>
        </div>
      `;
    }).join('');
  }

  // Paquetes más cotizados
  const pkgStats = {};
  cotizaciones.forEach(c => {
    const nombre = c.paquete_nombre || 'Personalizado';
    if (!pkgStats[nombre]) pkgStats[nombre] = { count: 0, valor: 0 };
    pkgStats[nombre].count += 1;
    pkgStats[nombre].valor += Number(c.valor_total || 0);
  });
  const pkgRanking = Object.entries(pkgStats).sort((a, b) => b[1].count - a[1].count);
  const pkgEl = document.getElementById('reportesPaquetesList');
  if (!pkgRanking.length) {
    pkgEl.innerHTML = '<div class="empty-state">Aún no hay cotizaciones generadas.</div>';
  } else {
    const maxCount = pkgRanking[0][1].count;
    pkgEl.innerHTML = pkgRanking.map(([nombre, s]) => {
      const pct = maxCount ? Math.round((s.count / maxCount) * 100) : 0;
      return `
        <div class="report-bar-row">
          <div class="report-bar-head"><span class="name">${escapeHtml(nombre)}</span><span class="count">${s.count} cotización${s.count === 1 ? '' : 'es'} · ${money(s.valor)}</span></div>
          <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');
  }

  // Mensualidad Año 1 por mes de cotización
  const meses = {};
  cotizaciones.forEach(c => {
    if (!c.fecha) return;
    const d = new Date(c.fecha);
    const key = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    if (!meses[key]) meses[key] = { orden: d.getFullYear() * 12 + d.getMonth(), total: 0, count: 0 };
    meses[key].total += Number(c.mensualidad_anio1 || 0);
    meses[key].count += 1;
  });
  const mesesRanking = Object.entries(meses).sort((a, b) => b[1].orden - a[1].orden).slice(0, 12);
  const mesesEl = document.getElementById('reportesMesesList');
  if (!mesesRanking.length) {
    mesesEl.innerHTML = '<div class="empty-state">Aún no hay cotizaciones generadas.</div>';
  } else {
    const maxTotal = Math.max(...mesesRanking.map(([, v]) => v.total));
    mesesEl.innerHTML = mesesRanking.map(([mes, v]) => {
      const pct = maxTotal ? Math.round((v.total / maxTotal) * 100) : 0;
      return `
        <div class="report-bar-row">
          <div class="report-bar-head"><span class="name">${escapeHtml(mes)}</span><span class="count">${v.count} cotización${v.count === 1 ? '' : 'es'} · ${money(v.total)}/mes</span></div>
          <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');
  }
}

function renderDashboard(salones, cotizaciones) {
  document.getElementById('dashboardDate').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const valorTotal = cotizaciones.reduce((s, c) => s + Number(c.valor_total || 0), 0);
  const mensualidadProm = cotizaciones.length
    ? cotizaciones.reduce((s, c) => s + Number(c.mensualidad_anio1 || 0), 0) / cotizaciones.length
    : 0;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="label">Salones registrados</div><div class="value">${salones.length}</div></div>
    <div class="stat-card"><div class="label">Cotizaciones generadas</div><div class="value">${cotizaciones.length}</div></div>
    <div class="stat-card"><div class="label">Valor total cotizado</div><div class="value">${money(valorTotal)}</div></div>
    <div class="stat-card"><div class="label">Mensualidad Año 1 promedio</div><div class="value">${money(mensualidadProm)}</div></div>
  `;

  const dashSalones = document.getElementById('dashSalonesList');
  if (!salones.length) {
    dashSalones.innerHTML = '<div class="empty-state">Aún no hay salones registrados.</div>';
  } else {
    dashSalones.innerHTML = salones.slice(0, 8).map(s => `
      <div class="quote-row">
        <div>
          <div class="quote-client">${escapeHtml(s.name)}</div>
          <div class="quote-meta">${escapeHtml(s.ciudad || 'Sin ciudad')}</div>
        </div>
      </div>
    `).join('');
  }

  const dashQuotes = document.getElementById('dashQuotesList');
  if (!cotizaciones.length) {
    dashQuotes.innerHTML = '<div class="empty-state">Aún no hay cotizaciones generadas.</div>';
  } else {
    dashQuotes.innerHTML = cotizaciones.slice(0, 8).map(c => `
      <div class="quote-row">
        <div>
          <div class="quote-client">${escapeHtml(c.salon)}</div>
          <div class="quote-meta">${escapeHtml(c.folio)} · ${escapeHtml(c.paquete_nombre || 'Personalizado')} · ${money(c.valor_total)} · Mensualidad ${money(c.mensualidad_anio1)}/mes</div>
        </div>
        <div class="quote-row-actions">
          ${estatusSelectHtml(c)}
          <button class="btn-ghost-sm" onclick="reprintQuote(${c.id})">Ver</button>
          <button class="remove-row-btn" onclick="deleteQuote(${c.id})">✕</button>
        </div>
      </div>
    `).join('');
  }
}

function renderSalonesTable(salones, cotizaciones) {
  const body = document.getElementById('salonesTableBody');
  const empty = document.getElementById('salonesEmpty');
  if (!salones.length) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  body.innerHTML = salones.map(s => {
    const suyas = cotizaciones.filter(c => c.salon && c.salon.toLowerCase() === s.name.toLowerCase());
    const ultima = suyas[0];
    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.ciudad || '—')}</td>
      <td>${suyas.length}</td>
      <td>${ultima ? new Date(ultima.fecha).toLocaleDateString('es-MX') : '—'}</td>
      <td>${ultima ? money(ultima.mensualidad_anio1) + '/mes' : '—'}</td>
    </tr>`;
  }).join('');
}

function renderHistorialTable(cotizaciones) {
  const body = document.getElementById('historialTableBody');
  const empty = document.getElementById('historialEmpty');
  if (!cotizaciones.length) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  body.innerHTML = cotizaciones.map(c => `
    <tr>
      <td>${escapeHtml(c.folio)}</td>
      <td>${escapeHtml(c.salon)}</td>
      <td>${escapeHtml(c.paquete_nombre || 'Personalizado')}</td>
      <td>${money(c.valor_total)}</td>
      <td>${money(c.mensualidad_anio1)}/mes</td>
      <td>${new Date(c.fecha).toLocaleDateString('es-MX')}</td>
      <td>${estatusSelectHtml(c)}</td>
      <td>
        <button class="btn-ghost-sm" onclick="reprintQuote(${c.id})">Ver</button>
        <button class="remove-row-btn" onclick="deleteQuote(${c.id})">✕</button>
      </td>
    </tr>
  `).join('');
}

function reprintQuote(id) {
  const c = (window.__cotizaciones || []).find(q => q.id === id);
  if (!c) return;
  renderRecibo(c, c.fecha);
  showView('recibo');
}

// Supabase Auth + la lista blanca app_users ya son el control de acceso real
// (solo alguien con sesión iniciada y autorizado llega aquí) — no hace falta
// una segunda contraseña local para borrar.
async function deleteQuote(id) {
  if (!confirm('¿Eliminar esta cotización? Esta acción no se puede deshacer.')) return;
  const ok = await sbDelete('cotizaciones', id);
  if (ok) { showToast('Cotización eliminada'); await refreshAll(); }
  else showToast('No se pudo eliminar');
}

// ---------- Cotizador ----------
// Un solo flujo (como en Spazio Luce): eliges un paquete de arranque (o no),
// ajustas la tabla de piezas con el catálogo, y de ahí sale tanto la cotización
// como, si quieres, un paquete nuevo guardado para reutilizar.
let currentItems = [];
let currentPackageMeta = { nombre: '', tier: '' };
let customPackages = [];
let activeCatalogSection = null;

// El folio toma el número más alto que exista y le suma 1 (no "cuántas
// cotizaciones hay"), para que no se repita si alguna se borró antes.
function nextFolioNumber(cotizaciones) {
  let max = 0;
  (cotizaciones || []).forEach(c => {
    const m = /^SC-(\d+)$/.exec(c.folio || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'SC-' + String(max + 1).padStart(4, '0');
}

async function prepareCotizador() {
  document.getElementById('quoteSalon').value = '';
  document.getElementById('quoteContacto').value = '';
  document.getElementById('quotePhone').value = '';
  document.getElementById('quoteEmail').value = '';
  document.getElementById('quoteCiudad').value = '';
  document.getElementById('quoteNote').value = '';
  document.getElementById('builderName').value = '';
  document.getElementById('catalogSearch').value = '';
  currentItems = [];
  currentPackageMeta = { nombre: '', tier: '' };

  const cotizaciones = window.__cotizaciones || await sbSelect('cotizaciones');
  document.getElementById('quoteFolio').value = nextFolioNumber(cotizaciones);

  customPackages = await sbSelect('paquetes', 'created_at.desc');

  activeCatalogSection = [...new Set(CATALOG.map(p => p.section))][0];
  renderPackageGrid();
  renderCatalogTabs();
  renderCatalogItems();
  renderBuilderRows();
  recalcPricing();
}

function allPackages() {
  const predefinidos = PAQUETES_PREDEFINIDOS.map(p => ({ ...p, es_predefinido: true }));
  return predefinidos.concat(customPackages.map(p => ({ ...p, es_predefinido: false })));
}

function packageValue(pkg) {
  return pkg.items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0), 0);
}

function renderPackageGrid() {
  const pkgs = allPackages();
  document.getElementById('packageGrid').innerHTML = pkgs.map((p, i) => `
    <div class="package-card ${currentPackageMeta.nombre === p.nombre ? 'selected' : ''}" onclick="selectPackage(${i})">
      ${p.es_predefinido ? '' : '<span class="tier-custom-badge">Personalizado</span><br/>'}
      <div class="tier-name">${escapeHtml(p.nombre)}</div>
      <div class="tier-count">${p.items.length} pieza(s)</div>
      <div class="tier-value">${money(packageValue(p))}</div>
      ${p.nota ? `<div class="tier-nota">${escapeHtml(p.nota)}</div>` : ''}
    </div>
  `).join('');
}

function selectPackage(i) {
  const p = allPackages()[i];
  if (!p) return;
  if (currentItems.length && !confirm('Esto reemplaza las piezas que ya tienes en la tabla por las de "' + p.nombre + '". ¿Continuar?')) return;
  currentItems = p.items.map(it => ({ ...it }));
  currentPackageMeta = { nombre: p.nombre, tier: p.tier || p.nombre };
  renderPackageGrid();
  renderBuilderRows();
  recalcPricing();
  showToast('Paquete "' + p.nombre + '" cargado — ajusta lo que necesites');
}

function renderCatalogTabs() {
  const sections = [...new Set(CATALOG.map(p => p.section))];
  document.getElementById('catalogTabs').innerHTML = sections.map(s => `
    <button type="button" class="catalog-tab ${s === activeCatalogSection ? 'active' : ''}" onclick="setCatalogSection('${s.replace(/'/g, "\\'")}')">${escapeHtml(s)}</button>
  `).join('');
}
function setCatalogSection(section) {
  activeCatalogSection = section;
  renderCatalogTabs();
  renderCatalogItems();
}
function renderCatalogItems() {
  const q = document.getElementById('catalogSearch').value.trim().toLowerCase();
  let items = CATALOG.filter(p => p.precio != null);
  items = q ? items.filter(p => p.producto.toLowerCase().includes(q) || p.clave.toLowerCase().includes(q)) : items.filter(p => p.section === activeCatalogSection);
  const box = document.getElementById('catalogItems');
  if (!items.length) { box.innerHTML = '<div class="catalog-empty">Sin resultados.</div>'; return; }
  box.innerHTML = items.map(p => `
    <div class="catalog-item">
      <div>
        <span class="name">${escapeHtml(p.producto)}</span>
        <span class="clave">${escapeHtml(p.clave)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="price">${money(p.precio)}</span>
        <button type="button" onclick="addCatalogItemToBuilder('${p.clave}')">+ Agregar</button>
      </div>
    </div>
  `).join('');
}
function addCatalogItemToBuilder(clave) {
  const prod = CATALOG.find(p => p.clave === clave);
  if (!prod) return;
  const existing = currentItems.find(it => it.clave === clave);
  if (existing) existing.cantidad = (Number(existing.cantidad) || 0) + 1;
  else currentItems.push({ clave: prod.clave, producto: prod.producto, desc: prod.desc, cantidad: 1, precioUnit: prod.precio });
  renderBuilderRows();
  recalcPricing();
}

function renderBuilderRows() {
  const box = document.getElementById('builderRows');
  if (!currentItems.length) { box.innerHTML = '<div class="catalog-empty">Aún no hay piezas — agrega desde el catálogo o con "+ Agregar pieza manual".</div>'; return; }
  box.innerHTML = currentItems.map((it, i) => `
    <div class="product-row">
      <input value="${escapeHtml(it.clave)}" oninput="updateBuilderRow(${i},'clave',this.value)" placeholder="Clave" />
      <input value="${escapeHtml(it.producto)}" oninput="updateBuilderRow(${i},'producto',this.value)" placeholder="Nombre de la pieza" />
      <input value="${escapeHtml(it.desc)}" oninput="updateBuilderRow(${i},'desc',this.value)" placeholder="Descripción / especificaciones" />
      <input type="number" min="1" value="${it.cantidad}" oninput="updateBuilderRow(${i},'cantidad',this.value)" />
      <input type="number" step="0.01" value="${it.precioUnit}" oninput="updateBuilderRow(${i},'precioUnit',this.value)" />
      <input id="builderRowSubtotal-${i}" value="${money((Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0))}" disabled />
      <button class="remove-row-btn" onclick="removeBuilderRow(${i})">✕</button>
    </div>
  `).join('');
}
// Solo actualiza el subtotal de la fila y el panel de precios sin re-dibujar
// toda la tabla — si no, el cursor se pierde en cada tecla que escribes.
function updateBuilderRow(i, field, value) {
  if (!currentItems[i]) return;
  currentItems[i][field] = (field === 'cantidad' || field === 'precioUnit') ? Number(value) || 0 : value;
  if (field === 'cantidad' || field === 'precioUnit') {
    const subtotalEl = document.getElementById('builderRowSubtotal-' + i);
    if (subtotalEl) subtotalEl.value = money((Number(currentItems[i].cantidad) || 0) * (Number(currentItems[i].precioUnit) || 0));
    recalcPricing();
  }
}
function removeBuilderRow(i) {
  currentItems.splice(i, 1);
  renderBuilderRows();
  recalcPricing();
}
function addBuilderRow() {
  currentItems.push({ clave: '', producto: '', desc: '', cantidad: 1, precioUnit: 0 });
  renderBuilderRows();
}

async function saveBuilderAsPackage() {
  const nombre = document.getElementById('builderName').value.trim();
  if (!nombre) { showToast('Ponle un nombre al paquete antes de guardarlo'); return; }
  if (!currentItems.length) { showToast('Agrega al menos una pieza'); return; }
  const valorTotal = currentItems.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0), 0);
  const row = { nombre, tier: 'Personalizado', items: currentItems, valor_total: valorTotal, es_predefinido: false };
  const inserted = await sbInsert('paquetes', row);
  if (!inserted) { showToast('No se pudo guardar el paquete'); return; }
  showToast('Paquete "' + nombre + '" guardado — ya aparece en Paquetes');
  currentPackageMeta = { nombre, tier: 'Personalizado' };
  customPackages = await sbSelect('paquetes', 'created_at.desc');
  renderPackageGrid();
  recalcPricing();
}

function recalcPricing() {
  const valorTotal = currentItems.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0), 0);
  const pct1 = Number(document.getElementById('pctAnio1').value) || 0;
  const pct2 = Number(document.getElementById('pctAnio2').value) || 0;
  const m1 = valorTotal * pct1 / 100;
  const m2 = valorTotal * pct2 / 100;
  document.getElementById('pkgCount').textContent = currentItems.length;
  document.getElementById('pkgValue').textContent = money(valorTotal);
  document.getElementById('mensualidadAnio1').textContent = money(m1) + ' /mes';
  document.getElementById('mensualidadAnio2').textContent = money(m2) + ' /mes';
  return { valorTotal, pct1, pct2, m1, m2 };
}

async function generateQuote() {
  const salon = document.getElementById('quoteSalon').value.trim();
  if (!salon) { showToast('Escribe el nombre del salón'); return; }
  if (!currentItems.length) { showToast('Elige un paquete o agrega piezas en el Armador'); return; }

  const { valorTotal, pct1, pct2, m1, m2 } = recalcPricing();
  const folio = document.getElementById('quoteFolio').value;

  const quote = {
    folio,
    salon,
    contacto: document.getElementById('quoteContacto').value.trim(),
    phone: document.getElementById('quotePhone').value.trim(),
    email: document.getElementById('quoteEmail').value.trim(),
    ciudad: document.getElementById('quoteCiudad').value.trim(),
    paquete_nombre: currentPackageMeta.nombre || 'Personalizado',
    tier: currentPackageMeta.tier || 'Personalizado',
    items: currentItems,
    valor_total: valorTotal,
    porcentaje_anio1: pct1,
    porcentaje_anio2: pct2,
    mensualidad_anio1: m1,
    mensualidad_anio2: m2,
    nota: document.getElementById('quoteNote').value.trim(),
    estatus: 'Enviada',
    generado_por: currentUser.email,
  };

  const inserted = await sbInsert('cotizaciones', quote);
  if (!inserted) { showToast('No se pudo guardar la cotización, revisa tu conexión'); return; }

  const salones = await sbSelect('clientes');
  if (!salones.find(s => s.name.toLowerCase() === salon.toLowerCase())) {
    await sbInsert('clientes', { name: salon, contacto: quote.contacto, phone: quote.phone, email: quote.email, ciudad: quote.ciudad });
  }

  showToast('Cotización ' + folio + ' generada y guardada');
  await refreshAll();
  document.getElementById('quoteFolio').value = nextFolioNumber(window.__cotizaciones || []);
  const fecha = (inserted[0] && inserted[0].fecha) ? inserted[0].fecha : new Date().toISOString();
  renderRecibo({ ...quote, id: inserted[0] && inserted[0].id }, fecha);
  showView('recibo');
}

// ---------- Recibo ----------
function renderRecibo(quote, fecha) {
  const fechaObj = new Date(fecha);
  const fmt = d => d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const contactoLine = [quote.contacto, quote.phone, quote.email].filter(Boolean).join(' · ') || '—';

  const rowsHtml = quote.items.map(it => `
    <tr>
      <td>
        <span class="item-name">${escapeHtml(it.producto)}</span>
        ${it.desc ? `<span class="item-sub">${escapeHtml(it.desc)}</span>` : ''}
        ${it.clave ? `<span class="item-sub">Clave: ${escapeHtml(it.clave)}</span>` : ''}
      </td>
      <td>${it.cantidad}</td>
      <td>${money(it.precioUnit)}</td>
      <td><strong>${money((Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0))}</strong></td>
    </tr>
  `).join('');

  document.getElementById('reciboCard').innerHTML = `
    <div class="recibo-header">
      <div>
        <div class="logo-block"><span class="wordmark">Spazio <span>Classe</span></span></div>
        <div class="logo-tagline">Inventario de lujo por mensualidad</div>
      </div>
      <div class="recibo-title">
        <h2>Cotización</h2>
        <div class="meta">
          Fecha: ${fmt(fechaObj)}<br/>
          Folio: ${escapeHtml(quote.folio)}
        </div>
      </div>
    </div>
    <div class="recibo-divider"></div>

    <div class="recibo-info">
      <div>
        <div><b>Salón:</b> ${escapeHtml(quote.salon)}</div>
        <div><b>Contacto:</b> ${escapeHtml(contactoLine)}</div>
        <div><b>Ciudad:</b> ${escapeHtml(quote.ciudad || '—')}</div>
      </div>
      <div>
        <div><b>Paquete:</b> ${escapeHtml(quote.paquete_nombre)}</div>
        <div><b>Validez:</b> 15 días</div>
        <div><b>Vigencia:</b> Mensualidad continua</div>
      </div>
    </div>

    <table>
      <thead><tr><th>Pieza</th><th>Cant.</th><th>Valor unitario</th><th>Subtotal</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="recibo-total-bar">
      <div>VALOR TOTAL DEL PAQUETE (reposición):</div>
      <div class="grand-amount">${money(quote.valor_total)}</div>
    </div>

    <div class="recibo-mensualidad">
      <div class="box">
        <div class="lbl">Mensualidad Año 1 (${quote.porcentaje_anio1}%)</div>
        <div class="amt">${money(quote.mensualidad_anio1)} /mes</div>
        <div class="sub">Se cobra haya o no haya eventos ese mes</div>
      </div>
      <div class="box">
        <div class="lbl">Mensualidad Año 2 en adelante (${quote.porcentaje_anio2}%)</div>
        <div class="amt">${money(quote.mensualidad_anio2)} /mes</div>
        <div class="sub">Tarifa preferencial de renovación</div>
      </div>
    </div>

    ${quote.nota ? `<div class="condiciones"><b>Nota:</b> ${escapeHtml(quote.nota)}</div>` : ''}

    <div class="condiciones">
      * El valor de cada pieza corresponde a su valor de reposición, documentado en este anexo.<br/>
      * La mensualidad se cobra de forma fija, haya o no haya eventos ese mes — el inventario está disponible en el salón todo el mes.<br/>
      * El inventario permanece en el salón de forma permanente mientras dure la relación comercial; se usa en cuantos eventos se necesite sin costo adicional por pieza.<br/>
      * El salón responde por daño, pérdida o robo del inventario mientras esté bajo su resguardo, conforme al valor de reposición de este anexo.<br/>
      * Spazio Classe da seguimiento y mantenimiento del inventario colocado.<br/>
      * Precios y condiciones sujetos a confirmación por escrito en el contrato definitivo.
    </div>

    <div class="firma-row">
      <div>Autoriza (Spazio Classe)</div>
      <div>Acepta (Salón)</div>
    </div>

    <div class="recibo-footer">
      <div class="brand">SPAZIO CLASSE</div>
      <span>spazio-classe.netlify.app</span>
      <span>spazioclasse.eventos@gmail.com</span>
      <span>+52 56 3399 5454</span>
    </div>
  `;

  wireReciboButtons(quote);
}

function wireReciboButtons(quote) {
  const waMsg = encodeURIComponent(
    `Hola, te comparto la cotización ${quote.folio} de Spazio Classe para ${quote.salon}: paquete ${quote.paquete_nombre}, mensualidad de ${money(quote.mensualidad_anio1)}/mes el primer año. En un momento te mando el PDF. ¡Gracias!`
  );
  const phoneDigits = (quote.phone || '').replace(/\D/g, '');
  document.getElementById('reciboWhatsBtn').onclick = () => {
    window.open(`https://wa.me/${phoneDigits}?text=${waMsg}`, '_blank');
  };
  document.getElementById('reciboMailBtn').onclick = () => {
    const subject = encodeURIComponent('Cotización ' + quote.folio + ' · Spazio Classe');
    window.open(`mailto:${quote.email || ''}?subject=${subject}&body=${waMsg}`, '_blank');
  };
}

(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    currentAccessToken = data.session.access_token;
    currentUser = { email: data.session.user.email };
    showApp();
    await refreshAll();
  }
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentAccessToken = session ? session.access_token : null;
  });
})();
