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
  let refreshToken = sessionStorage.getItem('sbd-admin-refresh-token');
  let tokenExpiresAt = Number(sessionStorage.getItem('sbd-admin-expires-at') || 0);
  let currentUser = null;
  let recoveryAccessToken = null;
  let refreshPromise = null;

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
    crmToast.textContent = cleanMessage(message, tone === 'warning' ? 'Something went wrong. Please retry.' : 'Done.');
    crmToast.dataset.tone = tone;
    crmToast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => crmToast.classList.remove('show'), 3200);
  }

  function cleanMessage(value, fallback = 'Something went wrong. Please retry.') {
    const message = typeof value === 'string' ? value.trim() : '';
    return message && !['null', 'undefined', '[object Object]'].includes(message.toLowerCase()) ? message : fallback;
  }

  function errorMessage(error, fallback) {
    const message = cleanMessage(error?.message || (typeof error === 'string' ? error : ''), fallback);
    if (fallback && /(foreign key constraint|violates .* constraint|invalid input syntax|duplicate key)/i.test(message)) return fallback;
    return message;
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

  function safeExternalUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function clientName(clientId) {
    const client = state.clients.find((item) => item.id === clientId);
    return client ? (client.company || client.name) : 'No client';
  }

  function projectName(projectId) {
    const project = state.projects.find((item) => item.id === projectId);
    return project?.title || '';
  }

  function leadName(leadId) {
    const lead = state.leads.find((item) => item.id === leadId);
    return lead ? (lead.company || lead.name) : '';
  }

  async function getConfig() {
    if (config) return config;
    const response = await fetch('/api/crm-config', { cache: 'no-store' });
    if (!response.ok) throw new Error('CRM configuration is not ready.');
    config = await response.json();
    return config;
  }

  function setConnection(tone, message, canRetry = false) {
    const connection = byId('crmConnection');
    if (!connection) return;
    connection.dataset.tone = tone;
    connection.querySelector('span').textContent = message;
    byId('retryCrmLoad').hidden = !canRetry;
  }

  function storeSession(session) {
    accessToken = session.access_token;
    refreshToken = session.refresh_token || refreshToken;
    tokenExpiresAt = Number(session.expires_at || 0) ||
      Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    sessionStorage.setItem('sbd-admin-token', accessToken);
    if (refreshToken) sessionStorage.setItem('sbd-admin-refresh-token', refreshToken);
    sessionStorage.setItem('sbd-admin-expires-at', String(tokenExpiresAt));
  }

  function clearSession() {
    accessToken = null;
    refreshToken = null;
    tokenExpiresAt = 0;
    currentUser = null;
    sessionStorage.removeItem('sbd-admin-token');
    sessionStorage.removeItem('sbd-admin-refresh-token');
    sessionStorage.removeItem('sbd-admin-expires-at');
  }

  async function refreshSession() {
    if (!refreshToken) throw new Error('Your session expired. Please sign in again.');
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      await getConfig();
      const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const session = await response.json().catch(() => ({}));
      if (!response.ok || !session.access_token) {
        clearSession();
        throw new Error('Your session expired. Please sign in again.');
      }
      storeSession(session);
      return session;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function ensureFreshSession() {
    if (!accessToken && refreshToken) return refreshSession();
    if (!accessToken) throw new Error('Please sign in to continue.');
    if (tokenExpiresAt && tokenExpiresAt <= Math.floor(Date.now() / 1000) + 60) {
      await refreshSession();
    }
  }

  function apiHeaders(extra = {}) {
    return {
      apikey: config.key,
      Authorization: `Bearer ${accessToken}`,
      ...extra,
    };
  }

  async function api(path, options = {}, allowRefresh = true) {
    await ensureFreshSession();
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

    if (response.status === 401 && allowRefresh && refreshToken) {
      await refreshSession();
      return api(path, options, false);
    }

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
    const created = Array.isArray(result) ? result[0] : result;
    if (!created?.id) throw new Error('The record was not confirmed by the database. Please retry.');
    return created;
  }

  async function updateRow(table, id, changes) {
    const result = await api(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: changes,
    });
    if (!Array.isArray(result) || !result.some((row) => row.id === id)) {
      throw new Error('The update was not confirmed by the database. Refresh and retry.');
    }
    return result[0];
  }

  async function deleteRow(table, id) {
    const result = await api(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    if (!Array.isArray(result) || !result.some((row) => row.id === id)) {
      throw new Error('The record was not removed. Refresh the CRM and retry.');
    }
    return result[0];
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
      storeSession(session);
      currentUser = session.user;
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
      state.leads = await selectRows('leads', 'id,client_id,name,company,email,phone,service,stage,budget_range,estimated_value,project_date,project_location,brief,reference_url,source,contact_preference,next_action,created_at,updated_at');
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
    setConnection('loading', 'Syncing CRM…');
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
    if (failed.length) {
      setConnection('warning', `${failed.length} module${failed.length === 1 ? '' : 's'} unavailable`, true);
      showToast(`Some modules could not load: ${failed.join(', ')}.`, 'warning');
    } else {
      setConnection('connected', 'Connected · all modules synced');
    }
  }

  function renderAll() {
    populateRelationshipSelects();
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

  function replaceSelectOptions(id, placeholder, options) {
    const select = byId(id);
    if (!select) return;
    const selected = select.value;
    select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>${options}`;
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }

  function populateRelationshipSelects() {
    const clientOptions = state.clients.map((client) => {
      const name = client.company || client.name;
      return `<option value="${escapeHTML(client.id)}">${escapeHTML(name)}</option>`;
    }).join('');
    replaceSelectOptions('projectClient', 'Select a client', clientOptions);
    replaceSelectOptions('contractClient', 'Select a client', clientOptions);
    replaceSelectOptions('financeClient', 'No client / general expense', clientOptions);

    const projectOptions = state.projects.map((project) =>
      `<option value="${escapeHTML(project.id)}" data-client-id="${escapeHTML(project.client_id)}">${escapeHTML(project.title)} · ${escapeHTML(clientName(project.client_id))}</option>`).join('');
    ['taskProject', 'financeProject', 'contractProject'].forEach((id) =>
      replaceSelectOptions(id, 'No linked project', projectOptions));

    const leadOptions = state.leads.map((lead) =>
      `<option value="${escapeHTML(lead.id)}">${escapeHTML(lead.company || lead.name)} · ${escapeHTML(titleCase(lead.stage))}</option>`).join('');
    replaceSelectOptions('projectLead', 'No linked lead', leadOptions);
    replaceSelectOptions('taskLead', 'No linked lead', leadOptions);
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
            ${lead.client_id ? '<span class="lead-linked">✓ Linked to client directory</span>' : ''}
            <details class="lead-details">
              <summary>Contact and project details</summary>
              <dl>
                <div><dt>Email</dt><dd><a href="mailto:${encodeURIComponent(lead.email)}">${escapeHTML(lead.email)}</a></dd></div>
                <div><dt>Phone</dt><dd>${lead.phone ? `<a href="tel:${escapeHTML(lead.phone.replace(/[^+\d]/g, ''))}">${escapeHTML(lead.phone)}</a>` : 'Not provided'}</dd></div>
                <div><dt>Budget</dt><dd>${escapeHTML(lead.budget_range || 'Not provided')}</dd></div>
                <div><dt>Preferred contact</dt><dd>${escapeHTML(lead.contact_preference || 'Email')}</dd></div>
                <div><dt>Timeline</dt><dd>${escapeHTML(lead.project_date || 'Not provided')}</dd></div>
                <div><dt>Location</dt><dd>${escapeHTML(lead.project_location || 'Not provided')}</dd></div>
                <div class="lead-brief"><dt>Project brief</dt><dd>${escapeHTML(lead.brief || 'No details provided').replace(/\n/g, '<br>')}</dd></div>
                ${safeExternalUrl(lead.reference_url) ? `<div class="lead-brief"><dt>Reference</dt><dd><a href="${escapeHTML(safeExternalUrl(lead.reference_url))}" target="_blank" rel="noopener">Open reference link ↗</a></dd></div>` : ''}
              </dl>
            </details>
            <label class="inline-control">Stage
              <select data-lead-stage="${escapeHTML(lead.id)}">
                ${['new','contacted','qualified','consultation','proposal','follow_up','booked','lost','future'].map((value) => `<option value="${value}" ${lead.stage === value ? 'selected' : ''}>${titleCase(value)}</option>`).join('')}
              </select>
            </label>
            <div class="record-actions">
              <a class="contact-action" href="mailto:${encodeURIComponent(lead.email)}">Email</a>
              ${lead.phone ? `<a class="contact-action" href="tel:${escapeHTML(lead.phone.replace(/[^+\d]/g, ''))}">Call</a>` : ''}
              <button data-lead-next="${escapeHTML(lead.id)}">Next action</button>
              ${lead.client_id ? '' : `<button data-convert-lead="${escapeHTML(lead.id)}">Create client</button>`}
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
      const projectCount = state.projects.filter((item) => item.client_id === client.id).length;
      const contractCount = state.contracts.filter((item) => item.client_id === client.id).length;
      const financeCount = state.finances.filter((item) => item.client_id === client.id).length;
      const relationshipText = [`${projectCount} project${projectCount === 1 ? '' : 's'}`, `${contractCount} contract${contractCount === 1 ? '' : 's'}`, `${financeCount} finance entr${financeCount === 1 ? 'y' : 'ies'}`].join(' · ');
      return `<article class="client-card">
        <div class="avatar">${escapeHTML(name.slice(0, 2).toUpperCase())}</div>
        <strong>${escapeHTML(name)}</strong>
        <span>${escapeHTML(client.industry || 'Client')}</span>
        <span>${escapeHTML(client.email || client.phone || 'No contact details')}</span>
        <small class="relationship-note">${escapeHTML(relationshipText)}</small>
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
    container.innerHTML = sorted.map((task) => {
      const relationship = projectName(task.project_id) || leadName(task.lead_id) || 'General task';
      return `<label>
      <input type="checkbox" data-task-toggle="${escapeHTML(task.id)}" ${task.completed_at ? 'checked' : ''} />
      <span><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(relationship)}</small></span>
      <em>${escapeHTML(task.category || 'Task')}</em>
      <span>${escapeHTML(dateTimeValue(task.due_at))}</span>
      <button type="button" class="danger-link" data-delete-task="${escapeHTML(task.id)}">Remove</button>
    </label>`;
    }).join('') || '<p class="empty-state">No tasks yet.</p>';
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
      <span>${escapeHTML(clientName(contract.client_id))}${contract.project_id ? `<small>${escapeHTML(projectName(contract.project_id) || 'Linked project')}</small>` : ''}</span>
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
      managedView: 'clients',
    }));
    state.leads.forEach((lead) => rows.push({
      id: `lead:${lead.id}`,
      name: lead.company || lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      type: 'Lead',
      source: lead.source || 'Website',
      removable: false,
      managedView: 'leads',
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
      const existing = unique.get(key);
      if (!existing) unique.set(key, row);
      else if (row.removable) existing.manualContactId = row.id;
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
      <div class="record-actions">${row.removable ? `<button class="danger-link" data-delete-contact="${escapeHTML(row.id)}">Remove</button>` : `<button data-open-managed="${escapeHTML(row.managedView)}">Open ${escapeHTML(row.type.toLowerCase())}</button>${row.manualContactId ? `<button class="danger-link" data-delete-contact="${escapeHTML(row.manualContactId)}">Remove manual copy</button>` : ''}`}</div>
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
      <span>${escapeHTML(entry.invoice_number || titleCase(entry.entry_type))} · ${escapeHTML(clientName(entry.client_id))}<small>${escapeHTML([projectName(entry.project_id), entry.payment_method || dateValue(entry.occurred_at)].filter(Boolean).join(' · '))}</small></span>
      <strong>${money(entry.amount)}</strong>
      <b class="badge ${['paid','completed','received'].includes(entry.status) ? 'success' : entry.status === 'overdue' ? 'danger' : 'warning'}">${escapeHTML(titleCase(entry.status))}</b>
      <div class="record-actions">${['payment','deposit'].includes(entry.entry_type) ? `<button data-receipt-entry="${escapeHTML(entry.id)}">Receipt</button>` : ''}<button class="danger-link" data-delete-finance="${escapeHTML(entry.id)}">Remove</button></div>
    </div>`).join('') || '<p class="empty-state">No financial entries yet. Record a real invoice, payment or expense.</p>';
  }

  const builtInMedia = [
    { media_type: 'image', name: 'Homepage hero poster', url: 'assets/images/hero/hero-launch.jpg', website_placement: 'home-hero-poster', placement_label: 'Homepage · Hero', alt_text: 'ShotByDiallo hero poster', managed: false },
    { media_type: 'video', name: 'Homepage background reel', url: 'assets/videos/hero-video.mp4', website_placement: 'home-hero-video', placement_label: 'Homepage · Hero', alt_text: '', managed: false },
    { media_type: 'video', name: 'Featured work reel', url: 'assets/videos/artist-reel.mp4', website_placement: 'work-featured-video', placement_label: 'Work · Featured', alt_text: '', managed: false },
    { media_type: 'image', name: 'About portrait', url: 'assets/images/about/portrait-optimized.jpg', website_placement: 'about-portrait', placement_label: 'Homepage · About', alt_text: 'Portrait of ShotByDiallo', managed: false },
  ];

  const mediaPlacementLabels = {
    'home-hero-poster': 'Homepage · Hero poster',
    'home-hero-video': 'Homepage · Hero video',
    'work-featured-video': 'Work · Featured video',
    'music-video-cover': 'Services · Music video cover',
    'business-video-cover': 'Services · Business video cover',
    'event-video-cover': 'Services · Event cover',
    'about-portrait': 'Homepage · About portrait',
  };

  function publicMediaUrl(path) {
    return `${config.url}/storage/v1/object/public/site-media/${path}`;
  }

  function mediaRows() {
    const managedByPlacement = new Map(state.media.map((item) => [item.website_placement, item]));
    const rows = builtInMedia.map((fallback) => {
      const managed = managedByPlacement.get(fallback.website_placement);
      if (!managed) return fallback;
      managedByPlacement.delete(fallback.website_placement);
      return {
        ...managed,
        url: publicMediaUrl(managed.storage_path),
        placement_label: mediaPlacementLabels[managed.website_placement] || fallback.placement_label,
        managed: true,
      };
    });
    managedByPlacement.forEach((managed) => rows.push({
      ...managed,
      url: publicMediaUrl(managed.storage_path),
      placement_label: mediaPlacementLabels[managed.website_placement] || managed.website_placement || 'Website',
      managed: true,
    }));
    return rows;
  }

  function renderMedia() {
    const container = byId('mediaGrid');
    if (!container || !config) return;
    const search = (byId('mediaSearch')?.value || '').toLowerCase();
    const type = byId('mediaFilter')?.value || 'all';
    const rows = mediaRows();
    const visible = rows.filter((item) => {
      const haystack = `${item.name} ${item.placement_label}`.toLowerCase();
      return (type === 'all' || item.media_type === type) && haystack.includes(search);
    });
    container.innerHTML = visible.map((item) => `<article class="media-card">
      ${item.media_type === 'video' ? '<div class="video-file-placeholder"><span>▶</span><small>Website video</small></div><span class="media-type">Video</span>' : `<img src="${escapeHTML(item.url)}" alt="${escapeHTML(item.alt_text || '')}" loading="lazy" /><span class="media-type">Image</span>`}
      <div><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.placement_label)}</span><small class="media-source">${item.managed ? 'Custom upload · live on website' : 'Built-in website fallback'}</small><code>${escapeHTML(item.url)}</code><div class="record-actions"><button data-open-media="${escapeHTML(item.url)}">Open</button><button data-replace-media="${escapeHTML(item.website_placement)}" data-media-alt="${escapeHTML(item.alt_text || '')}">Replace</button>${item.managed ? `<button class="danger-link" data-delete-media="${escapeHTML(item.id)}">Remove custom</button>` : ''}</div></div>
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

  function sanitizeContractHTML(markup) {
    const parsed = new DOMParser().parseFromString(`<main>${markup || ''}</main>`, 'text/html');
    const root = parsed.body.firstElementChild;
    const allowedTags = new Set(['MAIN', 'HEADER', 'H1', 'H2', 'P', 'SPAN', 'STRONG', 'BR', 'DIV', 'I', 'UL', 'OL', 'LI']);
    root.querySelectorAll('*').forEach((element) => {
      if (!allowedTags.has(element.tagName)) {
        element.remove();
        return;
      }
      const keepSignatureClass = element.classList?.contains('signature-grid');
      [...element.attributes].forEach((attribute) => element.removeAttribute(attribute.name));
      if (keepSignatureClass) element.className = 'signature-grid';
    });
    return root.innerHTML;
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
    const formElement = event.currentTarget;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      await action(new FormData(formElement));
      formElement.reset();
    } catch (error) {
      showToast(errorMessage(error, 'The change could not be saved. Please retry.'), 'warning');
    } finally {
      if (button) button.disabled = false;
    }
  }

  loginForm.addEventListener('submit', signIn);
  byId('sendPasswordReset').addEventListener('click', sendReset);
  recoveryForm.addEventListener('submit', saveRecoveryPassword);
  byId('cancelPasswordReset').addEventListener('click', () => showLogin());
  byId('crmLogout').addEventListener('click', () => {
    const token = accessToken;
    if (token && config) {
      fetch(`${config.url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: config.key, Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearSession();
    showLogin();
  });

  const views = document.querySelectorAll('.crm-view');
  const navItems = document.querySelectorAll('.nav-item');
  const titleMap = { overview:'Studio overview', leads:'Sales pipeline', projects:'Production projects', clients:'Client relationships', contracts:'Contracts & signatures', media:'Website media library', audience:'Audience & contacts', tasks:'Tasks & follow-ups', marketing:'Marketing prospects', finances:'Finances & cash flow', settings:'Studio settings' };
  function switchView(id) {
    views.forEach((view) => view.classList.toggle('active', view.id === id));
    navItems.forEach((item) => {
      const active = item.dataset.view === id;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
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
  function prepareMediaUpload(placement = '', alt = '') {
    const form = byId('mediaUploadForm');
    if (!form) return;
    form.reset();
    if (placement) form.elements.placement.value = placement;
    form.elements.alt.value = alt;
    const replacing = Boolean(placement);
    const heading = byId('mediaUploadModal')?.querySelector('h2');
    const submit = form.querySelector('[type="submit"]');
    if (heading) heading.textContent = replacing ? 'Replace website media' : 'Upload or replace media';
    if (submit) submit.textContent = replacing ? 'Replace and publish' : 'Upload and publish';
    openDialog('mediaUploadModal');
  }
  byId('addMediaButton')?.addEventListener('click', () => prepareMediaUpload());
  byId('retryCrmLoad')?.addEventListener('click', () => loadAll());

  ['financeProject', 'contractProject'].forEach((id) => byId(id)?.addEventListener('change', (event) => {
    const clientId = event.target.selectedOptions[0]?.dataset.clientId;
    const clientSelect = byId(id === 'financeProject' ? 'financeClient' : 'contractClient');
    if (clientId && clientSelect) clientSelect.value = clientId;
  }));
  byId('projectLead')?.addEventListener('change', (event) => {
    const lead = state.leads.find((item) => item.id === event.target.value);
    if (lead?.client_id) byId('projectClient').value = lead.client_id;
  });

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
    populateRelationshipSelects(); renderLeads(); renderAudience(); renderOverview();
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
    populateRelationshipSelects(); renderClients(); renderAudience(); renderOverview();
    showToast('Client added.');
  }));

  byId('projectFormAdmin')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    const sourceLead = state.leads.find((item) => item.id === form.get('lead_id'));
    if (sourceLead?.client_id && sourceLead.client_id !== form.get('client_id')) {
      throw new Error('The selected lead is linked to a different client. Choose the matching client.');
    }
    await insertRow('projects', {
      owner_id: currentUser.id,
      client_id: form.get('client_id'),
      lead_id: form.get('lead_id') || null,
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
    populateRelationshipSelects(); renderProjects(); renderOverview();
    showToast('Project added.');
  }));

  byId('taskForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    await insertRow('tasks', {
      owner_id: currentUser.id,
      project_id: form.get('project_id') || null,
      lead_id: form.get('lead_id') || null,
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
    const project = state.projects.find((item) => item.id === form.get('project_id'));
    const created = await insertRow('financial_entries', {
      owner_id: currentUser.id,
      client_id: project?.client_id || form.get('client_id') || null,
      project_id: form.get('project_id') || null,
      invoice_number: form.get('invoice_number')?.trim() || null,
      entry_type: form.get('entry_type'),
      amount: Number(form.get('amount') || 0),
      status: form.get('status') || 'pending',
      payment_method: form.get('payment_method')?.trim() || null,
      occurred_at: form.get('occurred_at') ? new Date(form.get('occurred_at')).toISOString() : new Date().toISOString(),
      notes: form.get('notes')?.trim() || null,
    });
    closeDialog('transactionModal');
    let synced = true;
    try { await loaders.finances(); }
    catch {
      synced = false;
      state.finances = [created, ...state.finances.filter((item) => item.id !== created.id)];
      setConnection('warning', 'Saved · refresh pending', true);
    }
    renderFinances();
    showToast(synced ? 'Financial entry saved and synced.' : 'Financial entry saved. The list will resync when the connection recovers.', synced ? 'success' : 'warning');
  }));

  let previewContractHTML = '';
  byId('contractForm')?.addEventListener('submit', (event) => submitForm(event, async (form) => {
    const data = Object.fromEntries(form.entries());
    const project = state.projects.find((item) => item.id === data.project_id);
    if (project) data.client_id = project.client_id;
    data.contract_html = buildContractHTML(data);
    await insertRow('contracts', {
      owner_id: currentUser.id,
      client_id: data.client_id,
      project_id: data.project_id || null,
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
    const convert = event.target.closest('[data-convert-lead]');
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
    if (convert) {
      const lead = state.leads.find((item) => item.id === convert.dataset.convertLead);
      if (!lead || !confirm(`Create a client record for ${lead.company || lead.name}?`)) return;
      try {
        let client = state.clients.find((item) =>
          lead.email && item.email && item.email.toLowerCase() === lead.email.toLowerCase());
        if (!client) {
          client = await insertRow('clients', {
            owner_id: currentUser.id,
            name: lead.name,
            company: lead.company || null,
            email: lead.email || null,
            phone: lead.phone || null,
            industry: lead.service ? titleCase(lead.service) : null,
            notes: lead.brief || null,
          });
        }
        await updateRow('leads', lead.id, {
          client_id: client.id,
          updated_at: new Date().toISOString(),
        });
        await Promise.all([loaders.leads(), loaders.clients()]);
        populateRelationshipSelects(); renderLeads(); renderClients(); renderAudience(); renderOverview();
        showToast('Lead linked to the client directory.');
      } catch (error) { showToast(error.message, 'warning'); }
    }
    if (remove && confirm('Remove this lead permanently?')) {
      try { await deleteRow('leads', remove.dataset.deleteLead); await Promise.all([loaders.leads(), loaders.projects(), loaders.tasks()]); populateRelationshipSelects(); renderLeads(); renderProjects(); renderTasks(); renderAudience(); renderOverview(); showToast('Lead removed. Linked projects were preserved and linked tasks were removed.'); }
      catch (error) { showToast(error.message, 'warning'); }
    }
  });

  byId('clientGrid')?.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-delete-client]');
    if (!remove) return;
    const clientId = remove.dataset.deleteClient;
    const projectCount = state.projects.filter((item) => item.client_id === clientId).length;
    const contractCount = state.contracts.filter((item) => item.client_id === clientId).length;
    if (projectCount || contractCount) {
      const links = [
        projectCount ? `${projectCount} project${projectCount === 1 ? '' : 's'}` : '',
        contractCount ? `${contractCount} contract${contractCount === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' and ');
      showToast(`This client is protected because it has ${links}. Remove or reassign those records first.`, 'warning');
      return;
    }
    if (confirm('Remove this client from the CRM? Finance entries and leads will stay saved but become unlinked.')) {
      try { await deleteRow('clients', clientId); await Promise.all([loaders.clients(), loaders.leads(), loaders.finances()]); populateRelationshipSelects(); renderClients(); renderLeads(); renderAudience(); renderFinances(); renderOverview(); showToast('Client removed and related history preserved.'); }
      catch (error) { showToast(errorMessage(error, 'The client could not be removed because another record still depends on it.'), 'warning'); }
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
      try { await deleteRow('projects', remove.dataset.deleteProject); await Promise.all([loaders.projects(), loaders.tasks(), loaders.finances(), loaders.contracts()]); populateRelationshipSelects(); renderProjects(); renderTasks(); renderFinances(); renderContracts(); renderOverview(); showToast('Project removed. Finance and contracts were preserved and unlinked.'); }
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
      byId('contractDocument').innerHTML = sanitizeContractHTML(contract?.contract_html || '<p>Contract content unavailable.</p>');
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
    const managed = event.target.closest('[data-open-managed]');
    if (managed) switchView(managed.dataset.openManaged);
    if (remove && confirm('Remove this manual contact?')) {
      try {
        const id = remove.dataset.deleteContact;
        await deleteRow('marketing_contacts', id);
        state.contacts = state.contacts.filter((item) => item.id !== id);
        try { await loaders.contacts(); } catch { setConnection('warning', 'Removed · refresh pending', true); }
        renderAudience(); renderMarketing(); showToast('Contact removed and deletion confirmed.');
      }
      catch (error) { showToast(errorMessage(error, 'The contact could not be removed. Refresh and retry.'), 'warning'); }
    }
  });
  byId('exportContacts')?.addEventListener('click', () => {
    const rows = audienceRows();
    const quote = (value) => {
      let safeValue = String(value || '');
      if (/^[\s]*[=+\-@]/.test(safeValue)) safeValue = `'${safeValue}`;
      return `"${safeValue.replace(/"/g, '""')}"`;
    };
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
      try {
        const id = remove.dataset.deleteFinance;
        await deleteRow('financial_entries', id);
        state.finances = state.finances.filter((item) => item.id !== id);
        try { await loaders.finances(); } catch { setConnection('warning', 'Removed · refresh pending', true); }
        renderFinances(); showToast('Financial entry removed and deletion confirmed.');
      }
      catch (error) { showToast(errorMessage(error, 'The financial entry could not be removed. Refresh and retry.'), 'warning'); }
    }
  });
  byId('printReceipt')?.addEventListener('click', () => window.print());

  byId('mediaSearch')?.addEventListener('input', renderMedia);
  byId('mediaFilter')?.addEventListener('change', renderMedia);
  async function deleteStorageObject(path) {
    if (!path) return;
    await ensureFreshSession();
    const response = await fetch(`${config.url}/storage/v1/object/site-media`, {
      method: 'DELETE',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [path] }),
    });
    if (!response.ok && response.status !== 404) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || 'The old media file could not be removed from storage.');
    }
  }

  byId('mediaGrid')?.addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open-media]');
    const replace = event.target.closest('[data-replace-media]');
    const remove = event.target.closest('[data-delete-media]');
    if (open) window.open(open.dataset.openMedia, '_blank', 'noopener');
    if (replace) prepareMediaUpload(replace.dataset.replaceMedia, replace.dataset.mediaAlt || '');
    if (remove) {
      const asset = state.media.find((item) => item.id === remove.dataset.deleteMedia);
      if (!asset || !confirm('Remove this custom media? A built-in image or video will return when that placement has a fallback.')) return;
      try {
        await deleteRow('media_assets', asset.id);
        state.media = state.media.filter((item) => item.id !== asset.id);
        let cleanupWarning = false;
        try { await deleteStorageObject(asset.storage_path); } catch { cleanupWarning = true; }
        try { await loaders.media(); } catch { setConnection('warning', 'Removed · refresh pending', true); }
        renderMedia();
        showToast(cleanupWarning ? 'Custom media removed. The website fallback is active; storage cleanup needs a retry.' : 'Custom media removed. The website fallback is now active.', cleanupWarning ? 'warning' : 'success');
      } catch (error) {
        showToast(errorMessage(error, 'The custom media could not be removed. Refresh and retry.'), 'warning');
      }
    }
  });
  byId('mediaUploadForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    const form = new FormData(formElement);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) {
      if (submit) submit.disabled = false;
      return showToast('Choose a media file first.', 'warning');
    }
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']);
    if (!allowedTypes.has(file.type)) {
      if (submit) submit.disabled = false;
      return showToast('Use JPG, PNG, WebP, AVIF, MP4 or WebM media.', 'warning');
    }
    if (file.size > 50 * 1024 * 1024) {
      if (submit) submit.disabled = false;
      return showToast('Media must be 50 MB or smaller.', 'warning');
    }
    const placement = form.get('placement');
    const path = `${placement}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    let uploaded = false;
    try {
      await ensureFreshSession();
      const upload = await fetch(`${config.url}/storage/v1/object/site-media/${path}`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': file.type, 'x-upsert': 'false' }),
        body: file,
      });
      if (!upload.ok) {
        const payload = await upload.json().catch(() => ({}));
        throw new Error(payload?.message || 'Media upload failed.');
      }
      uploaded = true;
      const mediaRecord = {
        owner_id: currentUser.id,
        name: file.name,
        media_type: file.type.startsWith('video/') ? 'video' : 'image',
        storage_path: path,
        website_placement: placement,
        alt_text: form.get('alt')?.trim() || null,
      };
      const existing = state.media.find((item) => item.website_placement === placement);
      let savedRecord;
      if (existing) {
        await updateRow('media_assets', existing.id, mediaRecord);
        savedRecord = { ...existing, ...mediaRecord };
      } else {
        savedRecord = await insertRow('media_assets', mediaRecord);
      }
      uploaded = false;
      let cleanupWarning = false;
      if (existing?.storage_path && existing.storage_path !== path) {
        try { await deleteStorageObject(existing.storage_path); } catch { cleanupWarning = true; }
      }
      closeDialog('mediaUploadModal');
      formElement.reset();
      let syncWarning = false;
      try { await loaders.media(); }
      catch {
        syncWarning = true;
        state.media = [savedRecord, ...state.media.filter((item) => item.id !== savedRecord.id && item.website_placement !== placement)];
        setConnection('warning', 'Saved · refresh pending', true);
      }
      renderMedia();
      const warning = cleanupWarning || syncWarning;
      showToast(warning ? 'New media is live. A background cleanup or refresh still needs a retry.' : 'Media replaced and published to the website.', warning ? 'warning' : 'success');
    } catch (error) {
      if (uploaded) deleteStorageObject(path).catch(() => {});
      showToast(errorMessage(error, 'The media could not be published. Please retry.'), 'warning');
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

  byId('todayLabel').textContent = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  window.addEventListener('offline', () => setConnection('offline', 'Offline · changes paused', true));
  window.addEventListener('online', () => {
    if (currentUser) loadAll();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) ensureFreshSession().catch(() => {
      clearSession();
      showLogin('Your session expired. Please sign in again.');
    });
  });

  const recoveryParams = new URLSearchParams(location.hash.slice(1));
  if (recoveryParams.get('type') === 'recovery' && recoveryParams.get('access_token')) {
    showRecovery(recoveryParams.get('access_token'));
  } else {
    getConfig().then(async () => {
      if (!accessToken && !refreshToken) return showLogin();
      try {
        await verifySession();
        await loadAll();
      } catch {
        clearSession();
        showLogin('Your session expired. Please sign in again.');
      }
    }).catch((error) => showLogin(error.message));
  }
});
