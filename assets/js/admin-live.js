document.addEventListener('DOMContentLoaded', () => {
  const byId = (id) => document.getElementById(id);
  const authGate = byId('crmAuth');
  const crmApp = byId('crmApp');
  const authStatus = byId('crmAuthStatus');
  const loginForm = byId('crmLoginForm');
  const recoveryForm = byId('crmRecoveryForm');
  const authHeading = byId('crmAuthHeading');
  const authIntro = byId('crmAuthIntro');
  const crmToast = byId('crmToast');

  let config = null;
  let accessToken = sessionStorage.getItem('sbd-admin-token');
  let currentUser = null;
  let recoveryAccessToken = null;

  const state = {
    leads: [],
    clients: [],
    projects: [],
    tasks: [],
    media: [],
    contracts: [],
    contacts: [],
    finances: [],
  };

  function showToast(message, tone = 'success') {
    if (!crmToast) return;
    crmToast.textContent = message;
    crmToast.dataset.tone = tone;
    crmToast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => crmToast.classList.remove('show'), 3200);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    })[character]);
  }

  function titleCase(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function money(value) {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function dateValue(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA');
  }

  function dateTimeValue(value) {
    if (!value) return 'No date';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'No date'
      : date.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function clientName(clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    return client ? (client.company || client.name) : 'No client';
  }

  async function getConfig() {
    if (config) return config;
    const response = await fetch('/api/crm-config', { cache: 'no-store' });
    if (!response.ok) throw new Error('CRM configuration is not ready.');
    config = await response.json();
    return config;
  }

  function apiHeaders(extra = {}) {
    return {
      apikey: config.key,
      Authorization: `Bearer ${accessToken}`,
      ...extra,
    };
  }

  async function api(path, options = {}) {
    const method = options.method || 'GET';
    const headers = apiHeaders(options.headers || {});
    let body;

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(`${config.url}${path}`, {
      method,
      headers,
      body,
    });

    const raw = await response.text();
    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = raw; }
    }

    if (!response.ok) {
      const message = payload?.message || payload?.error_description || payload?.error ||
        (typeof payload === 'string' ? payload : '') || `Request failed (${response.status}).`;
      throw new Error(message);
    }

    return payload;
  }

  async function selectRows(table, select = '*', order = 'created_at.desc') {
    const query = new URLSearchParams({ select, order });
    return (await api(`/rest/v1/${table}?${query.toString()}`)) || [];
  }

  async function insertRow(table, row) {
    const result = await api(`/rest/v1/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: row,
    });
    return Array.isArray(result) ? result[0] : result;
  }

  async function updateRow(table, id, changes) {
    await api(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: changes,
    });
  }

  async function deleteRow(table, id) {
    await api(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  function showLogin(message = '') {
    recoveryForm.hidden = true;
    loginForm.hidden = false;
    authHeading.textContent = 'Sign in to your studio CRM.';
    authIntro.textContent = 'Manage real inquiries, clients, projects and business records.';
    authStatus.textContent = message;
    authGate.hidden = false;
    crmApp.hidden = true;
  }

  function showRecovery(token) {
    recoveryAccessToken = token;
    loginForm.hidden = true;
    recoveryForm.hidden = false;
    authHeading.textContent = 'Create your new password.';
    authIntro.textContent = 'Choose a password with at least 12 characters.';
    authStatus.textContent = '';
  }

  async function verifySession() {
    const user = await api('/auth/v1/user');
    currentUser = user;
    byId('crmUserName').textContent = user.email || 'Studio owner';
    authGate.hidden = true;
    crmApp.hidden = false;
  }

  async function signIn(event) {
    event.preventDefault();
    authStatus.textContent = 'Signing in…';
    try {
      await getConfig();
      const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: byId('crmEmail').value.trim(),
          password: byId('crmPassword').value,
        }),
      });
      const session = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(session.error_description || session.msg || 'Incorrect email or password.');
      accessToken = session.access_token;
      currentUser = session.user;
      sessionStorage.setItem('sbd-admin-token', accessToken);
      byId('crmUserName').textContent = currentUser.email || 'Studio owner';
      authGate.hidden = true;
      crmApp.hidden = false;
      authStatus.textContent = '';
      await loadAll();
    } catch (error) {
      authStatus.textContent = error.message;
    }
  }

  async function sendReset() {
    const email = byId('crmEmail');
    if (!email.reportValidity()) return;
    authStatus.textContent = 'Sending password reset email…';
    try {
      await getConfig();
      const response = await fetch(`${config.url}/auth/v1/recover`, {
        method: 'POST',
        headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), redirect_to: `${location.origin}/admin` }),
      });
      if (!response.ok) throw new Error('Unable to send a reset email right now.');
      authStatus.textContent = 'A password reset email has been requested.';
    } catch (error) {
      authStatus.textContent = error.message;
    }
  }

  async function saveRecoveryPassword(event) {
    event.preventDefault();
    const password = byId('crmNewPassword').value;
    const confirmation = byId('crmConfirmPassword').value;
    if (password !== confirmation) {
      authStatus.textContent = 'The two passwords do not match.';
      return;
    }
    if (!recoveryAccessToken) {
      showLogin('This recovery link is missing or expired.');
      return;
    }
    try {
      await getConfig();
      const response = await fetch(`${config.url}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${recoveryAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error('This recovery link has expired.');
      history.replaceState({}, document.title, location.pathname);
      recoveryAccessToken = null;
      recoveryForm.reset();
      showLogin('Password updated. Sign in with your new password.');
    } catch (error) {
      authStatus.textContent = error.message;
    }
  }

  const loaders = {
    leads: async () => {
      state.leads = await selectRows('leads', 'id,name,company,email,phone,service,stage,budget_range,estimated_value,project_date,project_location,brief,source,next_action,created_at,updated_at');
    },
    clients: async () => {
      state.clients = await selectRows('clients', 'id,name,company,email,phone,industry,instagram,notes,created_at');
    },
    projects: async () => {
      state.projects = await selectRows('projects', 'id,client_id,lead_id,title,service,stage,value,shoot_at,deadline_at,location,brief,delivery_url,preview_url,created_at,updated_at');
    },
    tasks: async () => {
      state.tasks = await selectRows('tasks', 'id,lead_id,project_id,title,category,due_at,completed_at,created_at');
    },
    media: async () => {
      state.media = await selectRows('media_assets', 'id,name,media_type,storage_path,website_placement,alt_text,created_at');
    },
    contracts: async () => {
      state.contracts = await selectRows('contracts', 'id,client_id,project_id,title,contract_html,total_amount,deposit_percent,service_date,location,delivery_delay,revision_count,status,sent_at,signed_at,created_at,updated_at');
    },
    contacts: async () => {
      state.contacts = await selectRows('marketing_contacts', 'id,company,contact_name,email,phone,industry,source,status,last_contacted_at,next_follow_up_at,notes,created_at');
    },
    finances: async () => {
      state.finances = await selectRows('financial_entries', 'id,project_id,client_id,invoice_number,entry_type,amount,status,payment_method,occurred_at,notes,created_at', 'occurred_at.desc');
    },
  };

  async function loadAll() {
    const entries = Object.entries(loaders);
    const results = await Promise.allSettled(entries.map(([, loader]) => loader()));
    const failed = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failed.push(entries[index][0]);
        console.warn(`Unable to load ${entries[index][0]}:`, result.reason);
      }
    });
    renderAll();
    if (failed.length) showToast(`Some modules could not load: ${failed.join(', ')}.`, 'warning');
  }

  function renderAll() {
    populateClientSelects();
    renderLeads();
    renderClients();
    renderProjects();
    renderTasks();
    renderContracts();
    renderAudience();
    renderMarketing();
    renderFinances();
    renderMedia();
    renderOverview();
  }

  function populateClientSelects() {
    const options = state.clients.map((client) => {
      const name = client.company || client.name;
      return `<option value="${escapeHTML(client.id)}">${escapeHTML(name)}</option>`;
    }).join('');
    ['projectClient', 'contractClient', 'financeClient'].forEach((id) => {
      const select = byId(id);
      if (select) select.innerHTML = `<option value="">Select a client</option>${options}`;
    });
  }

  function leadModel(row) {
    return {
      ...row,
      value: Number(row.estimated_value || 0),
      stageLabel: titleCase(row.stage || 'new'),
      serviceLabel: titleCase(row.service || 'other'),
    };
  }

  function renderLeads() {
    const search = (byId('leadSearch')?.value || '').toLowerCase();
    const filter = byId('leadFilter')?.value || 'all';
    const rows = state.leads.map(leadModel).filter((lead) => {
      const matchesFilter = filter === 'all' || lead.stageLabel === filter;
      const haystack = `${lead.name} ${lead.company || ''} ${lead.email} ${lead.serviceLabel}`.toLowerCase();
      return matchesFilter && haystack.includes(search);
    });
    const stages = ['New', 'Contacted', 'Qualified', 'Consultation', 'Proposal', 'Follow Up', 'Booked', 'Future', 'Lost'];
    const kanban = byId('leadKanban');
    if (kanban) {
      kanban.innerHTML = stages.map((stage) => {
        const stageRows = rows.filter((lead) => lead.stageLabel === stage);
        return `<section class="kanban-column"><h3>${stage}<span>${stageRows.length}</span></h3>${stageRows.map((lead) => `
          <article class="lead-card">
            <p>${escapeHTML(lead.company || lead.name)}</p>
            <span>${escapeHTML(lead.name)} · ${escapeHTML(lead.serviceLabel)}</span>
            <strong>${money(lead.value)}</strong>
            <small>${escapeHTML(lead.next_action || 'No next action')} · ${escapeHTML(lead.source || 'Website')}</small>
            <label class="inline-control">Stage
              <select data-lead-stage="${escapeHTML(lead.id)}">
                ${['new','contacted','qualified','consultation','proposal','follow_up','booked','lost','future'].map((value) => `<option value="${value}" ${lead.stage === value ? 'selected' : ''}>${titleCase(value)}</option>`).join('')}
              </select>
            </label>
            <div class="record-actions">
              <button data-lead-next="${escapeHTML(lead.id)}">Next action</button>
              <button class="danger-link" data-delete-lead="${escapeHTML(lead.id)}">Remove</button>
            </div>
          </article>`).join('') || '<p class="empty-state">No leads in this stage.</p>'}</section>`;
      }).join('');
    }
    const overviewList = byId('overviewLeadList');
    if (overviewList) {
      overviewList.innerHTML = state.leads.slice(0, 4).map((row) => {
        const lead = leadModel(row);
        return `<div class="mini-lead"><div><strong>${escapeHTML(lead.company || lead.name)}</strong><span>${escapeHTML(lead.serviceLabel)} · ${money(lead.value)}</span></div><span>${escapeHTML(lead.stageLabel)}</span></div>`;
      }).join('') || '<p class="empty-state">No project inquiries yet.</p>';
    }
  }

  function renderClients() {
    const container = byId('clientGrid');
    if (!container) return;
    container.innerHTML = state.clients.map((client) => {
      const name = client.company || client.name;
      return `<article class="client-card">
        <div class="avatar">${escapeHTML(name.slice(0, 2).toUpperCase())}</div>
        <strong>${escapeHTML(name)}</strong>
        <span>${escapeHTML(client.industry || 'Client')}</span>
        <span>${escapeHTML(client.email || client.phone || 'No contact details')}</span>
        <div class="record-actions"><button class="danger-link" data-delete-client="${escapeHTML(client.id)}">Remove</button></div>
      </article>`;
    }).join('') || '<p class="empty-state">No clients yet. Add a client manually or convert a booked lead.</p>';
  }

  function renderProjects() {
    const container = byId('projectTable');
    if (!container) return;
    container.innerHTML = `<div class="project-row project-row-pro header"><span>Project</span><span>Stage</span><span>Service</span><span>Due</span><span>Value</span><span>Actions</span></div>${state.projects.map((project) => `
      <div class="project-row project-row-pro">
        <div><strong>${escapeHTML(project.title)}</strong><small>${escapeHTML(clientName(project.client_id))} · ${escapeHTML(project.location || 'Location not set')}</small></div>
        <select data-project-stage="${escapeHTML(project.id)}">${['brief','pre_production','scheduled','filming','editing','client_review','delivered','completed','archived'].map((value) => `<option value="${value}" ${project.stage === value ? 'selected' : ''}>${titleCase(value)}</option>`).join('')}</select>
        <span class="badge">${escapeHTML(titleCase(project.service))}</span>
        <span>${escapeHTML(dateValue(project.deadline_at) || '—')}</span>
        <strong>${money(project.value)}</strong>
        <div class="record-actions"><button class="danger-link" data-delete-project="${escapeHTML(project.id)}">Remove</button></div>
      </div>`).join('') || '<p class="empty-state">No projects yet. Add a real project when work is booked.</p>'}`;
  }

  function renderTasks() {
    const container = byId('taskBoard');
    if (!container) return;
    const sorted = [...state.tasks].sort((a, b) => {
      if (a.completed_at && !b.completed_at) return 1;
      if (!a.completed_at && b.completed_at) return -1;
      return new Date(a.due_at || '2999-01-01') - new Date(b.due_at || '2999-01-01');
    });
    container.innerHTML = sorted.map((task) => `<label>
      <input type="checkbox" data-task-toggle="${escapeHTML(task.id)}" ${task.completed_at ? 'checked' : ''} />
      <span>${escapeHTML(task.title)}</span>
      <em>${escapeHTML(task.category || 'Task')}</em>
      <span>${escapeHTML(dateTimeValue(task.due_at))}</span>
      <button type="button" class="danger-link" data-delete-task="${escapeHTML(task.id)}">Remove</button>
    </label>`).join('') || '<p class="empty-state">No tasks yet.</p>';
  }

  function renderContracts() {
    const count = (statuses) => state.contracts.filter((item) => statuses.includes(item.status)).length;
    byId('contractDraftCount').textContent = count(['draft']);
    byId('contractSentCount').textContent = count(['sent', 'viewed']);
    byId('contractSignedCount').textContent = count(['signed']);
    byId('contractValue').textContent = money(state.contracts.reduce((sum, item) => sum + Number(item.total_amount || 0), 0));
    const container = byId('contractList');
    if (!container) return;
    container.innerHTML = state.contracts.map((contract) => `<div class="contract-row">
      <strong>${escapeHTML(contract.title)}</strong>
      <span>${escapeHTML(clientName(contract.client_id))}</span>
      <span>${money(contract.total_amount)}</span>
      <b class="badge ${contract.status === 'signed' ? 'success' : contract.status === 'sent' || contract.status === 'viewed' ? 'warning' : ''}">${escapeHTML(titleCase(contract.status))}</b>
      <div class="record-actions">
        <button data-open-contract="${escapeHTML(contract.id)}">Open</button>
        ${contract.status === 'draft' ? `<button data-contract-status="${escapeHTML(contract.id)}" data-status="sent">Mark sent</button>` : ''}
        ${contract.status !== 'signed' ? `<button data-contract-status="${escapeHTML(contract.id)}" data-status="signed">Mark signed</button>` : ''}
        <button class="danger-link" data-delete-contract="${escapeHTML(contract.id)}">Remove</button>
      </div>
    </div>`).join('') || '<p class="empty-state">No contracts yet. Create your first real contract.</p>';
  }

  function audienceRows() {
    const rows = [];
    state.clients.forEach((client) => rows.push({
      id: `client:${client.id}`,
      name: client.company || client.name,
      email: client.email || '',
      phone: client.phone || '',
      type: 'Client',
      source: 'Client directory',
      removable: false,
    }));
    state.leads.forEach((lead) => rows.push({
      id: `lead:${lead.id}`,
      name: lead.company || lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      type: 'Lead',
      source: lead.source || 'Website',
      removable: false,
    }));
    state.contacts.filter((contact) => ['audience', 'contact', 'subscriber'].includes(contact.status)).forEach((contact) => rows.push({
      id: contact.id,
      name: contact.company || contact.contact_name,
      email: contact.email || '',
      phone: contact.phone || '',
      type: 'Manual contact',
      source: contact.source || 'Manual',
      removable: true,
    }));
    const unique = new Map();
    rows.forEach((row) => {
      const key = (row.email || `${row.type}:${row.name}`).toLowerCase();
      if (!unique.has(key)) unique.set(key, row);
    });
    return [...unique.values()];
  }

  function renderAudience() {
    const rows = audienceRows();
    byId('audienceTotal').textContent = rows.length;
    byId('audienceClientCount').textContent = state.clients.length;
    byId('audienceLeadCount').textContent = state.leads.length;
    byId('audienceManualCount').textContent = state.contacts.filter((item) => ['audience', 'contact', 'subscriber'].includes(item.status)).length;
    const container = byId('audienceTable');
    if (!container) return;
    container.innerHTML = `<div class="audience-row audience-row-pro header"><span>Contact</span><span>Type</span><span>Source</span><span>Actions</span></div>${rows.map((row) => `<div class="audience-row audience-row-pro">
      <div><strong>${escapeHTML(row.name)}</strong><small>${escapeHTML(row.email || row.phone || 'No contact details')}</small></div>
      <span class="badge">${escapeHTML(row.type)}</span>
      <span>${escapeHTML(row.source)}</span>
      <div class="record-actions">${row.removable ? `<button class="danger-link" data-delete-contact="${escapeHTML(row.id)}">Remove</button>` : '<span>Managed in its module</span>'}</div>
    </div>`).join('') || '<p class="empty-state">No contacts yet.</p>'}`;
  }

  function marketingRows() {
    return state.contacts.filter((contact) => !['audience', 'contact', 'subscriber'].includes(contact.status));
  }

  function renderMarketing() {
    const rows = marketingRows();
    byId('marketingTotal').textContent = rows.length;
    byId('marketingResearch').textContent = rows.filter((item) => item.status === 'research').length;
    byId('marketingContacted').textContent = rows.filter((item) => item.status === 'contacted').length;
    byId('marketingReplied').textContent = rows.filter((item) => ['replied', 'qualified', 'booked'].includes(item.status)).length;
    const container = byId('marketingTable');
    if (!container) return;
    container.innerHTML = `<div class="project-row header"><span>Prospect</span><span>Status</span><span>Source</span><span>Follow-up</span></div>${rows.map((contact) => `<div class="project-row">
      <div><strong>${escapeHTML(contact.company)}</strong><small>${escapeHTML(contact.contact_name || contact.email || contact.phone || 'No contact person')}</small></div>
      <select data-marketing-status="${escapeHTML(contact.id)}">${['research','contacted','replied','qualified','booked','not_interested'].map((value) => `<option value="${value}" ${contact.status === value ? 'selected' : ''}>${titleCase(value)}</option>`).join('')}</select>
      <span>${escapeHTML(contact.source || 'Manual')}</span>
      <div><span>${escapeHTML(dateValue(contact.next_follow_up_at) || 'No follow-up')}</span><button class="danger-link" data-delete-marketing="${escapeHTML(contact.id)}">Remove</button></div>
    </div>`).join('') || '<p class="empty-state">No marketing prospects yet.</p>'}`;
  }

  function renderFinances() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = state.finances.filter((entry) => new Date(entry.occurred_at || entry.created_at) >= monthStart);
    const revenue = thisMonth.filter((entry) => ['payment', 'deposit'].includes(entry.entry_type) && !['cancelled', 'void'].includes(entry.status)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const expenses = thisMonth.filter((entry) => entry.entry_type === 'expense').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const refunds = thisMonth.filter((entry) => entry.entry_type === 'refund').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const outstanding = state.finances.filter((entry) => entry.entry_type === 'invoice' && ['due', 'overdue', 'pending', 'sent'].includes(entry.status)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    byId('financeRevenueMonth').textContent = money(revenue);
    byId('financeOutstanding').textContent = money(outstanding);
    byId('financeExpensesMonth').textContent = money(expenses);
    byId('financeNetMonth').textContent = money(revenue - expenses - refunds);
    const container = byId('invoiceList');
    if (!container) return;
    container.innerHTML = state.finances.map((entry) => `<div class="invoice-row invoice-row-actions">
      <span>${escapeHTML(entry.invoice_number || titleCase(entry.entry_type))} · ${escapeHTML(clientName(entry.client_id))}<small>${escapeHTML(entry.payment_method || dateValue(entry.occurred_at) || '')}</small></span>
      <strong>${money(entry.amount)}</strong>
      <b class="badge ${['paid','completed','received'].includes(entry.status) ? 'success' : entry.status === 'overdue' ? 'danger' : 'warning'}">${escapeHTML(titleCase(entry.status))}</b>
      <div class="record-actions">${['payment','deposit'].includes(entry.entry_type) ? `<button data-receipt-entry="${escapeHTML(entry.id)}">Receipt</button>` : ''}<button class="danger-link" data-delete-finance="${escapeHTML(entry.id)}">Remove</button></div>
    </div>`).join('') || '<p class="empty-state">No financial entries yet. Record a real invoice, payment or expense.</p>';
  }

  const builtInMedia = [
    ['image', 'Homepage hero poster', 'assets/images/hero/hero-launch.jpg', 'Homepage · Hero'],
    ['video', 'Homepage background reel', 'assets/videos/hero-video.mp4', 'Homepage · Hero'],
    ['video', 'Featured work reel', 'assets/videos/artist-reel.mp4', 'Work · Featured'],
    ['image', 'About portrait', 'assets/images/about/portrait-optimized.jpg', 'Homepage · About'],
  ];

  function publicMediaUrl(path) {
    return `${config.url}/storage/v1/object/public/site-media/${path}`;
  }

  function renderMedia() {
    const container = byId('mediaGrid');
    if (!container || !config) return;
    const search = (byId('mediaSearch')?.value || '').toLowerCase();
    const type = byId('mediaFilter')?.value || 'all';
    const rows = state.media.length
      ? state.media.map((item) => [item.media_type, item.name, publicMediaUrl(item.storage_path), item.website_placement || 'Website', item.alt_text || ''])
      : builtInMedia;
    const visible = rows.filter((item) => (type === 'all' || item[0] === type) && item[1].toLowerCase().includes(search));
    container.innerHTML = visible.map((item) => `<article class="media-card">
      ${item[0] === 'video' ? '<div class="video-file-placeholder"><span>▶</span><small>Website video</small></div><span class="media-type">Video</span>' : `<img src="${escapeHTML(item[2])}" alt="${escapeHTML(item[4])}" loading="lazy" /><span class="media-type">Image</span>`}
      <div><strong>${escapeHTML(item[1])}</strong><span>${escapeHTML(item[3])}</span><code>${escapeHTML(item[2])}</code><div class="record-actions"><button data-open-media="${escapeHTML(item[2])}">Open</button></div></div>
    </article>`).join('') || '<p class="empty-state">No media found.</p>';
  }

  function renderOverview() {
    const leads = state.leads.map(leadModel);
    const activeProjects = state.projects.filter((project) => !['delivered','completed','archived'].includes(project.stage));
    const openTasks = state.tasks.filter((task) => !task.completed_at);
    byId('pipelineValue').textContent = money(leads.filter((lead) => lead.stage !== 'lost').reduce((sum, lead) => sum + lead.value, 0));
    byId('clientCount').textContent = state.clients.length;
    byId('activeProjects').textContent = activeProjects.length;
    byId('taskCount').textContent = openTasks.length;
    const stageCount = (stage) => state.leads.filter((lead) => lead.stage === stage).length;
    byId('pipelineNew').textContent = stageCount('new');
    byId('pipelineContacted').textContent = stageCount('contacted');
    byId('pipelineProposal').textContent = stageCount('proposal');
    byId('pipelineBooked').textContent = stageCount('booked');
    byId('leadBadge').textContent = stageCount('new');

    const sources = state.leads.reduce((map, lead) => {
      const source = lead.source || 'Website';
      map[source] = (map[source] || 0) + 1;
      return map;
    }, {});
    const sourceList = byId('leadSourceList');
    if (sourceList) {
      const total = state.leads.length || 1;
      sourceList.innerHTML = Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([source, count]) => {
        const percentage = Math.round((count / total) * 100);
        return `<div class="source-row"><span>${escapeHTML(source)}</span><i><b style="width:${percentage}%"></b></i><strong>${percentage}%</strong></div>`;
      }).join('') || '<p class="empty-state">Lead sources will appear after inquiries arrive.</p>';
    }

    const taskList = byId('overviewTaskList');
    if (taskList) {
      taskList.innerHTML = [...openTasks].sort((a, b) => new Date(a.due_at || '2999-01-01') - new Date(b.due_at || '2999-01-01')).slice(0, 4).map((task) => `<label><input type="checkbox" disabled /><span>${escapeHTML(task.title)}</span><span>${escapeHTML(dateValue(task.due_at) || 'No due date')}</span></label>`).join('') || '<p class="empty-state">No open tasks.</p>';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const schedule = [
      ...activeProjects.filter((project) => project.deadline_at).map((project) => ({ title: project.title, label: `Project · ${titleCase(project.stage)}`, date: new Date(project.deadline_at) })),
      ...openTasks.filter((task) => task.due_at).map((task) => ({ title: task.title, label: task.category ? `Task · ${titleCase(task.category)}` : 'Task', date: new Date(task.due_at) })),
    ].filter((item) => !Number.isNaN(item.date.getTime()) && item.date >= today).sort((a, b) => a.date - b.date).slice(0, 4);
    const scheduleContainer = byId('overviewSchedule');
    if (scheduleContainer) {
      scheduleContainer.innerHTML = schedule.map((item) => `<div class="schedule-item"><time><b>${item.date.toLocaleDateString('en-CA', { day: '2-digit' })}</b>${item.date.toLocaleDateString('en-CA', { month: 'short' }).toUpperCase()}</time><div><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.label)} · ${escapeHTML(dateTimeValue(item.date))}</span></div></div>`).join('') || '<p class="empty-state">No upcoming projects or tasks.</p>';
    }

    const threeDays = new Date(today);
    threeDays.setDate(threeDays.getDate() + 3);
    const health = { onTrack: 0, atRisk: 0, delayed: 0, awaiting: 0 };
    activeProjects.forEach((project) => {
      const due = project.deadline_at ? new Date(project.deadline_at) : null;
      if (project.stage === 'client_review') health.awaiting += 1;
      else if (due && due < today) health.delayed += 1;
      else if (due && due <= threeDays) health.atRisk += 1;
      else health.onTrack += 1;
    });
    const total = activeProjects.length || 1;
    [['projectOnTrack','projectOnTrackBar',health.onTrack],['projectAtRisk','projectAtRiskBar',health.atRisk],['projectDelayed','projectDelayedBar',health.delayed],['projectAwaiting','projectAwaitingBar',health.awaiting]].forEach(([countId, barId, value]) => {
      byId(countId).textContent = value;
      byId(barId).style.width = `${Math.round((value / total) * 100)}%`;
    });
    const urgentTasks = openTasks.filter((task) => task.due_at && new Date(task.due_at) <= threeDays).length;
    const attention = urgentTasks + health.atRisk + health.delayed;
    byId('actionCenterCount').textContent = attention ? `${attention} item${attention === 1 ? '' : 's'} need your attention` : 'No urgent items today';
  }

  function buildContractHTML(data) {
    const client = clientName(data.client_id);
    const total = Number(data.total_amount || 0);
    const deposit = total * Number(data.deposit_percent || 0) / 100;
    const balance = total - deposit;
    const created = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(new Date());
    const serviceDate = data.service_date ? new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(new Date(`${data.service_date}T12:00:00`)) : 'à confirmer';
    return `<header><p>SHOTBYDIALLO</p><h1>CONTRAT DE PRESTATION</h1><span>Production photo et vidéo</span></header>
      <h2>Entre les parties</h2><p><strong>Prestataire :</strong> ShotByDiallo, représenté par Abdourahmane Diallo.</p><p><strong>Client :</strong> ${escapeHTML(client)}.</p>
      <h2>1. Objet</h2><p><strong>${escapeHTML(data.title)}</strong></p><p>${escapeHTML(data.scope || '').replace(/\n/g, '<br>')}</p>
      <h2>2. Date et lieu</h2><p>Date : <strong>${escapeHTML(serviceDate)}</strong><br>Lieu : <strong>${escapeHTML(data.location || 'À confirmer')}</strong></p>
      <h2>3. Livrables</h2><p>${escapeHTML(data.deliverables || '').replace(/\n/g, '<br>')}</p>
      <h2>4. Tarification</h2><p>Montant total : <strong>${money(total)}</strong><br>Acompte : <strong>${money(deposit)}</strong><br>Solde : <strong>${money(balance)}</strong></p>
      <h2>5. Livraison et révisions</h2><p>Délai : ${escapeHTML(data.delivery_delay || 'À confirmer')}. Révisions incluses : ${escapeHTML(data.revision_count || 0)}.</p>
      ${data.notes ? `<h2>6. Conditions particulières</h2><p>${escapeHTML(data.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <h2>Acceptation</h2><p>Fait à Montréal, le ${created}.</p><div class="signature-grid"><div><span>Signature du Prestataire</span><strong>Abdourahmane Diallo</strong><i></i></div><div><span>Signature du Client</span><strong>${escapeHTML(client)}</strong><i></i></div></div>`;
  }

  function openDialog(id) {
    const dialog = byId(id);
    if (dialog?.showModal) dialog.showModal();
  }

  function closeDialog(id) {
    const dialog = byId(id);
    if (dialog?.open) dialog.close();
  }

  async function submitForm(event, action) {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      await action(new FormData(event.currentTarget));
      event.currentTarget.reset();
    } catch (error) {
      showToast(error.message, 'warning');
    } finally {
      if (button) button.disabled = false;
    }
  }

  loginForm.addEventListener('submit', signIn);
  byId('sendPasswordReset').addEventListener('click', sendReset);
  recoveryForm.addEventListener('submit', saveRecoveryPassword);
  byId('cancelPasswordReset').addEventListener('click', () => showLogin());
  byId('crmLogout').addEventListener('click', () => {
    sessionStorage.removeItem('sbd-admin-token');
    accessToken = null;
    currentUser = null;
    showLogin();
  });

  const views = document.querySelectorAll('.crm-view');
  const navItems = document.querySelectorAll('.nav-item');
  const titleMap = { overview:'Studio overview', leads:'Sales pipeline', projects:'Production projects', clients:'Client relationships', contracts:'Contracts & signatures', media:'Website media library', audience:'Audience & contacts', tasks:'Tasks & follow-ups', marketing:'Marketing prospects', finances:'Finances & cash flow', settings:'Studio settings' };
  function switchView(id) {
    views.forEach((view) => view.classList.toggle('active', view.id === id));
    navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === id));
    byId('viewTitle').textContent = titleMap[id] || 'Studio CRM';
    byId('globalNewLead').hidden = !['overview','leads'].includes(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  navItems.forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
  document.querySelectorAll('[data-view-jump]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.viewJump)));

  document.querySelectorAll('[data-open-modal], #globalNewLead').forEach((button) => button.addEventListener('click', () => openDialog('leadModal')));
  byId('newClientButton')?.addEventListener('click', () => openDialog('clientModal'));
  byId('newProjectButton')?.addEventListener('click', () => openDialog('projectModal'));
  byId('newTaskButton')?.addEventListener('click', () => openDialog('taskModal'));
  byId('newContractButton')?.addEventListener('click', () => openDialog('contractModal'));
  byId('addContactButton')?.addEventListener('click', () => openDialog('audienceContactModal'));
  byId('addProspectButton')?.addEventListener('click', () => openDialog('marketingContactModal'));
  byId('addTransactionButton')?.addEventListener('click', () => openDialog('transactionModal'));
  byId('addMediaButton')?.addEventListener('click', () => openDialog('mediaUploadModal'));

  byId('newLeadForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    await insertRow('leads', {
      owner_id: currentUser.id,
      name: form.get('name').trim(),
      company: form.get('company')?.trim() || null,
      email: form.get('email').trim().toLowerCase(),
      phone: form.get('phone')?.trim() || null,
      service: form.get('service'),
      stage: 'new',
      estimated_value: Number(form.get('estimated_value') || 0),
      source: form.get('source') || 'Manual',
      next_action: form.get('next_action')?.trim() || null,
      brief: form.get('brief')?.trim() || null,
    });
    closeDialog('leadModal');
    await loaders.leads();
    renderLeads(); renderAudience(); renderOverview();
    showToast('Lead added. Website inquiries also arrive here automatically.');
  }));

  byId('clientForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    await insertRow('clients', {
      owner_id: currentUser.id,
      name: form.get('name').trim(),
      company: form.get('company')?.trim() || null,
      email: form.get('email')?.trim().toLowerCase() || null,
      phone: form.get('phone')?.trim() || null,
      industry: form.get('industry')?.trim() || null,
      notes: form.get('notes')?.trim() || null,
    });
    closeDialog('clientModal');
    await loaders.clients();
    populateClientSelects(); renderClients(); renderAudience(); renderOverview();
    showToast('Client added.');
  }));

  byId('projectFormAdmin')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    await insertRow('projects', {
      owner_id: currentUser.id,
      client_id: form.get('client_id'),
      title: form.get('title').trim(),
      service: form.get('service'),
      stage: form.get('stage'),
      value: Number(form.get('value') || 0),
      deadline_at: form.get('deadline_at') ? new Date(form.get('deadline_at')).toISOString() : null,
      location: form.get('location')?.trim() || null,
      brief: form.get('brief')?.trim() || null,
    });
    closeDialog('projectModal');
    await loaders.projects();
    renderProjects(); renderOverview();
    showToast('Project added.');
  }));

  byId('taskForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    await insertRow('tasks', {
      owner_id: currentUser.id,
      title: form.get('title').trim(),
      category: form.get('category')?.trim() || null,
      due_at: form.get('due_at') ? new Date(form.get('due_at')).toISOString() : null,
    });
    closeDialog('taskModal');
    await loaders.tasks();
    renderTasks(); renderOverview();
    showToast('Task added.');
  }));

  byId('audienceContactForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    const contactName = form.get('contact_name')?.trim() || '';
    await insertRow('marketing_contacts', {
      owner_id: currentUser.id,
      company: form.get('company')?.trim() || contactName,
      contact_name: contactName || null,
      email: form.get('email')?.trim().toLowerCase() || null,
      phone: form.get('phone')?.trim() || null,
      industry: form.get('industry')?.trim() || null,
      source: form.get('source')?.trim() || 'Manual audience',
      status: 'audience',
      notes: form.get('notes')?.trim() || null,
    });
    closeDialog('audienceContactModal');
    await loaders.contacts();
    renderAudience(); renderMarketing();
    showToast('Contact added.');
  }));

  byId('marketingContactForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    await insertRow('marketing_contacts', {
      owner_id: currentUser.id,
      company: form.get('company').trim(),
      contact_name: form.get('contact_name')?.trim() || null,
      email: form.get('email')?.trim().toLowerCase() || null,
      phone: form.get('phone')?.trim() || null,
      industry: form.get('industry')?.trim() || null,
      source: form.get('source')?.trim() || 'Manual outreach',
      status: form.get('status') || 'research',
      next_follow_up_at: form.get('next_follow_up_at') ? new Date(form.get('next_follow_up_at')).toISOString() : null,
      notes: form.get('notes')?.trim() || null,
    });
    closeDialog('marketingContactModal');
    await loaders.contacts();
    renderMarketing(); renderAudience();
    showToast('Prospect added.');
  }));

  byId('transactionForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    await insertRow('financial_entries', {
      owner_id: currentUser.id,
      client_id: form.get('client_id') || null,
      invoice_number: form.get('invoice_number')?.trim() || null,
      entry_type: form.get('entry_type'),
      amount: Number(form.get('amount') || 0),
      status: form.get('status') || 'pending',
      payment_method: form.get('payment_method')?.trim() || null,
      occurred_at: form.get('occurred_at') ? new Date(form.get('occurred_at')).toISOString() : new Date().toISOString(),
      notes: form.get('notes')?.trim() || null,
    });
    closeDialog('transactionModal');
    await loaders.finances();
    renderFinances();
    showToast('Financial entry saved.');
  }));

  let previewContractHTML = '';
  byId('contractForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    const data = Object.fromEntries(form.entries());
    data.contract_html = buildContractHTML(data);
    await insertRow('contracts', {
      owner_id: currentUser.id,
      client_id: data.client_id,
      title: data.title.trim(),
      contract_html: data.contract_html,
      total_amount: Number(data.total_amount || 0),
      deposit_percent: Number(data.deposit_percent || 0),
      service_date: data.service_date || null,
      location: data.location?.trim() || null,
      delivery_delay: data.delivery_delay?.trim() || null,
      revision_count: Number(data.revision_count || 0),
      status: data.status || 'draft',
    });
    closeDialog('contractModal');
    await loaders.contracts();
    renderContracts();
    showToast('Contract saved.');
  }));
  byId('previewContract')?.addEventListener('click', () => {
    const form = byId('contractForm');
    if (!form.reportValidity()) return;
    previewContractHTML = buildContractHTML(Object.fromEntries(new FormData(form).entries()));
    byId('contractDocument').innerHTML = previewContractHTML;
    openDialog('contractPreviewModal');
  });
  byId('printContract')?.addEventListener('click', () => window.print());

  byId('leadKanban')?.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-lead-stage]');
    if (!select) return;
    try {
      await updateRow('leads', select.dataset.leadStage, { stage: select.value, updated_at: new Date().toISOString() });
      await loaders.leads(); renderLeads(); renderAudience(); renderOverview();
      showToast('Lead stage updated.');
    } catch (error) { showToast(error.message, 'warning'); }
  });
  byId('leadKanban')?.addEventListener('click', async (event) => {
    const next = event.target.closest('[data-lead-next]');
    const remove = event.target.closest('[data-delete-lead]');
    if (next) {
      const lead = state.leads.find((item) => item.id === next.dataset.leadNext);
      const value = prompt('Next action', lead?.next_action || '');
      if (value === null) return;
      try {
        await updateRow('leads', next.dataset.leadNext, { next_action: value || null, updated_at: new Date().toISOString() });
        await loaders.leads(); renderLeads(); renderOverview();
      } catch (error) { showToast(error.message, 'warning'); }
    }
    if (remove && confirm('Remove this lead permanently?')) {
      try { await deleteRow('leads', remove.dataset.deleteLead); await loaders.leads(); renderLeads(); renderAudience(); renderOverview(); showToast('Lead removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });

  byId('clientGrid')?.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-delete-client]');
    if (remove && confirm('Remove this client? Projects or contracts linked to the client may prevent deletion.')) {
      try { await deleteRow('clients', remove.dataset.deleteClient); await loaders.clients(); populateClientSelects(); renderClients(); renderAudience(); renderOverview(); showToast('Client removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });

  byId('projectTable')?.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-project-stage]');
    if (!select) return;
    try { await updateRow('projects', select.dataset.projectStage, { stage: select.value, updated_at: new Date().toISOString() }); await loaders.projects(); renderProjects(); renderOverview(); showToast('Project stage updated.'); }
    catch (error) { showToast(error.message, 'warning'); }
  });
  byId('projectTable')?.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-delete-project]');
    if (remove && confirm('Remove this project?')) {
      try { await deleteRow('projects', remove.dataset.deleteProject); await loaders.projects(); renderProjects(); renderOverview(); showToast('Project removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });

  byId('taskBoard')?.addEventListener('change', async (event) => {
    const toggle = event.target.closest('[data-task-toggle]');
    if (!toggle) return;
    try { await updateRow('tasks', toggle.dataset.taskToggle, { completed_at: toggle.checked ? new Date().toISOString() : null }); await loaders.tasks(); renderTasks(); renderOverview(); }
    catch (error) { showToast(error.message, 'warning'); }
  });
  byId('taskBoard')?.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-delete-task]');
    if (remove && confirm('Remove this task?')) {
      try { await deleteRow('tasks', remove.dataset.deleteTask); await loaders.tasks(); renderTasks(); renderOverview(); showToast('Task removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });

  byId('contractList')?.addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open-contract]');
    const status = event.target.closest('[data-contract-status]');
    const remove = event.target.closest('[data-delete-contract]');
    if (open) {
      const contract = state.contracts.find((item) => item.id === open.dataset.openContract);
      byId('contractDocument').innerHTML = contract?.contract_html || '<p>Contract content unavailable.</p>';
      openDialog('contractPreviewModal');
    }
    if (status) {
      try {
        const changes = { status: status.dataset.status, updated_at: new Date().toISOString() };
        if (status.dataset.status === 'sent') changes.sent_at = new Date().toISOString();
        if (status.dataset.status === 'signed') changes.signed_at = new Date().toISOString();
        await updateRow('contracts', status.dataset.contractStatus, changes);
        await loaders.contracts(); renderContracts(); showToast('Contract status updated.');
      } catch (error) { showToast(error.message, 'warning'); }
    }
    if (remove && confirm('Remove this contract?')) {
      try { await deleteRow('contracts', remove.dataset.deleteContract); await loaders.contracts(); renderContracts(); showToast('Contract removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });

  byId('audienceTable')?.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-delete-contact]');
    if (remove && confirm('Remove this manual contact?')) {
      try { await deleteRow('marketing_contacts', remove.dataset.deleteContact); await loaders.contacts(); renderAudience(); renderMarketing(); showToast('Contact removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });
  byId('exportContacts')?.addEventListener('click', () => {
    const rows = audienceRows();
    const quote = (value) => `"${String(value || '').replace(/"/g, '""')}"`;
    const csv = [['Name','Email','Phone','Type','Source'], ...rows.map((row) => [row.name,row.email,row.phone,row.type,row.source])].map((row) => row.map(quote).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'shotbydiallo-contacts.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  byId('marketingTable')?.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-marketing-status]');
    if (!select) return;
    try { await updateRow('marketing_contacts', select.dataset.marketingStatus, { status: select.value, last_contacted_at: ['contacted','replied','qualified','booked'].includes(select.value) ? new Date().toISOString() : null }); await loaders.contacts(); renderMarketing(); renderAudience(); showToast('Prospect updated.'); }
    catch (error) { showToast(error.message, 'warning'); }
  });
  byId('marketingTable')?.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-delete-marketing]');
    if (remove && confirm('Remove this prospect?')) {
      try { await deleteRow('marketing_contacts', remove.dataset.deleteMarketing); await loaders.contacts(); renderMarketing(); renderAudience(); showToast('Prospect removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });

  const receiptModal = byId('receiptModal');
  byId('invoiceList')?.addEventListener('click', async (event) => {
    const receipt = event.target.closest('[data-receipt-entry]');
    const remove = event.target.closest('[data-delete-finance]');
    if (receipt) {
      const entry = state.finances.find((item) => item.id === receipt.dataset.receiptEntry);
      if (entry) {
        const receiptNumber = `REC-${String(entry.id).slice(0, 8).toUpperCase()}`;
        byId('receiptDocument').innerHTML = `<header><div><p>SHOTBYDIALLO</p><h1>Reçu de paiement</h1></div><strong>${escapeHTML(receiptNumber)}</strong></header><section><p><span>Reçu de</span><strong>${escapeHTML(clientName(entry.client_id))}</strong></p><p><span>Facture</span><strong>${escapeHTML(entry.invoice_number || '—')}</strong></p><p><span>Date</span><strong>${escapeHTML(dateValue(entry.occurred_at))}</strong></p><p><span>Méthode</span><strong>${escapeHTML(entry.payment_method || 'Non précisée')}</strong></p></section><div class="receipt-total"><span>Montant reçu</span><strong>${money(entry.amount)}</strong></div><footer><p>Ce reçu confirme le paiement enregistré pour les services de ShotByDiallo.</p><p>Abdourahmane Diallo · ShotByDiallo · Montréal, Québec</p></footer>`;
        receiptModal.showModal();
      }
    }
    if (remove && confirm('Remove this financial entry?')) {
      try { await deleteRow('financial_entries', remove.dataset.deleteFinance); await loaders.finances(); renderFinances(); showToast('Financial entry removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });
  byId('printReceipt')?.addEventListener('click', () => window.print());

  byId('mediaSearch')?.addEventListener('input', renderMedia);
  byId('mediaFilter')?.addEventListener('change', renderMedia);
  byId('mediaGrid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-media]');
    if (button) window.open(button.dataset.openMedia, '_blank', 'noopener');
  });
  byId('mediaUploadForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return;
    const placement = form.get('placement');
    const path = `${placement}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    try {
      const upload = await fetch(`${config.url}/storage/v1/object/site-media/${path}`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': file.type, 'x-upsert': 'false' }),
        body: file,
      });
      if (!upload.ok) throw new Error('Media upload failed.');
      await insertRow('media_assets', {
        owner_id: currentUser.id,
        name: file.name,
        media_type: file.type.startsWith('video/') ? 'video' : 'image',
        storage_path: path,
        website_placement: placement,
        alt_text: form.get('alt')?.trim() || null,
      });
      closeDialog('mediaUploadModal');
      event.currentTarget.reset();
      await loaders.media(); renderMedia();
      showToast('Media uploaded and available to the website.');
    } catch (error) { showToast(error.message, 'warning'); }
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

  byId('todayLabel').textContent = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  const recoveryParams = new URLSearchParams(location.hash.slice(1));
  if (recoveryParams.get('type') === 'recovery' && recoveryParams.get('access_token')) {
    showRecovery(recoveryParams.get('access_token'));
  } else {
    getConfig().then(async () => {
      if (!accessToken) return showLogin();
      try {
        await verifySession();
        await loadAll();
      } catch {
        sessionStorage.removeItem('sbd-admin-token');
        accessToken = null;
        showLogin('Your session expired. Please sign in again.');
      }
    }).catch((error) => showLogin(error.message));
  }
});
