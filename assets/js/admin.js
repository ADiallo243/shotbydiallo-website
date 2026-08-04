document.addEventListener('DOMContentLoaded', function () {
  let projects = [];
  let clients = [];
  let tasks = [];
  let leads = [];
  let accessToken = sessionStorage.getItem('sbd-admin-token');
  let supabaseConfig = null;
  const authGate = document.getElementById('crmAuth');
  const crmApp = document.getElementById('crmApp');
  const authStatus = document.getElementById('crmAuthStatus');
  const crmToast = document.getElementById('crmToast');
  const quickEditModal = document.getElementById('quickEditModal');
  const quickEditForm = document.getElementById('quickEditForm');
  const quickEditInput = document.getElementById('quickEditInput');
  const confirmModal = document.getElementById('confirmModal');
  let quickEditCallback = null;
  let confirmCallback = null;

  function showToast(message, tone = 'success') {
    crmToast.textContent = message;
    crmToast.dataset.tone = tone;
    crmToast.classList.add('show');
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => crmToast.classList.remove('show'), 2800);
  }

  function titleCase(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  async function loadRealLeads() {
    const response = await fetch(`${supabaseConfig.url}/rest/v1/leads?select=id,name,company,email,phone,service,stage,budget_range,estimated_value,project_date,project_location,brief,source,next_action,created_at&order=created_at.desc`, {
      headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Unable to load your leads. Please sign in again.');
    const records = await response.json();
    leads = records.map((lead) => ({
      id: lead.id, name: lead.name, company: lead.company || lead.name,
      service: titleCase(lead.service), value: Number(lead.estimated_value || 0),
      stage: titleCase(lead.stage), source: lead.source || 'Website',
      next: lead.next_action || `Website request · ${new Date(lead.created_at).toLocaleDateString('en-CA')}`,
    }));
    renderLeads();
  }

  async function supabaseRows(table, select, order = 'created_at.desc') {
    const response = await fetch(`${supabaseConfig.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${order}`, {
      headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Unable to load ${table}.`);
    return response.json();
  }

  async function supabaseUpdate(table, id, changes) {
    const response = await fetch(`${supabaseConfig.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(changes),
    });
    if (!response.ok) throw new Error('Unable to save the update.');
  }

  async function loadOperations() {
    const [clientRows, projectRows, taskRows] = await Promise.all([
      supabaseRows('clients', 'id,name,company,email,phone,industry,created_at'),
      supabaseRows('projects', 'id,title,service,stage,value,deadline_at,location,created_at'),
      supabaseRows('tasks', 'id,title,category,due_at,completed_at,created_at'),
    ]);
    clients = clientRows.map((client) => ({ ...client, displayName: client.company || client.name }));
    projects = projectRows;
    tasks = taskRows;
    document.getElementById('clientCount').textContent = clients.length;
    document.getElementById('activeProjects').textContent = projects.length;
    document.getElementById('taskCount').textContent = tasks.filter((task) => !task.completed_at).length;
    renderClients();
    renderProjects();
    renderTasks();
  }

  async function signIn(event) {
    event.preventDefault();
    const email = document.getElementById('crmEmail').value.trim();
    const password = document.getElementById('crmPassword').value;
    authStatus.textContent = 'Signing in…';
    try {
      supabaseConfig = await fetch('/api/crm-config').then(async (response) => {
        if (!response.ok) throw new Error('CRM configuration is not ready.');
        return response.json();
      });
      const response = await fetch(`${supabaseConfig.url}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: supabaseConfig.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error('Incorrect email or password.');
      const session = await response.json();
      accessToken = session.access_token;
      sessionStorage.setItem('sbd-admin-token', accessToken);
      document.getElementById('crmUserName').textContent = session.user.email;
      await loadRealLeads();
      await loadOperations();
      await loadManagedMedia();
      authGate.hidden = true;
      crmApp.hidden = false;
    } catch (error) { authStatus.textContent = error.message; }
  }
  document.getElementById('crmLoginForm').addEventListener('submit', signIn);
  document.getElementById('crmLogout').addEventListener('click', () => {
    sessionStorage.removeItem('sbd-admin-token'); accessToken = null; leads = [];
    crmApp.hidden = true; authGate.hidden = false; document.getElementById('crmPassword').value = '';
  });
  function openQuickEdit(title, label, value, callback, inputType = 'text') {
    document.getElementById('quickEditTitle').textContent = title;
    document.getElementById('quickEditLabel').firstChild.textContent = label;
    quickEditInput.type = inputType;
    quickEditInput.value = value;
    quickEditCallback = callback;
    quickEditModal.showModal();
    quickEditInput.focus();
  }
  function confirmAction(message, callback) {
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = callback;
    confirmModal.showModal();
  }
  quickEditForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (quickEditCallback) quickEditCallback(quickEditInput.value);
    quickEditModal.close();
    showToast('Changes saved');
  });
  document.getElementById('confirmRemove').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    confirmModal.close();
    showToast('Record removed', 'neutral');
  });

  const views = document.querySelectorAll('.crm-view');
  const navItems = document.querySelectorAll('.nav-item');
  const title = document.getElementById('viewTitle');
  const titleMap = { overview: 'Studio overview', leads: 'Sales pipeline', projects: 'Production projects', clients: 'Client relationships', contracts: 'Contracts & signatures', media: 'Website media library', audience: 'Audience & referrals', tasks: 'Tasks & follow-ups', marketing: 'Marketing performance', finances: 'Finances & cash flow', settings: 'Studio settings' };

  function switchView(id) {
    views.forEach((view) => view.classList.toggle('active', view.id === id));
    navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === id));
    title.textContent = titleMap[id];
    document.getElementById('globalNewLead').hidden = !['overview', 'leads'].includes(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  navItems.forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
  document.querySelectorAll('[data-view-jump]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.viewJump)));

  function money(value) { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value); }
  function renderLeads() {
    const search = (document.getElementById('leadSearch')?.value || '').toLowerCase();
    const filter = document.getElementById('leadFilter')?.value || 'all';
    const visible = leads.filter((lead) => (filter === 'all' || lead.stage === filter) && `${lead.name} ${lead.company} ${lead.service}`.toLowerCase().includes(search));
    const stages = ['New', 'Contacted', 'Proposal', 'Booked'];
    document.getElementById('leadKanban').innerHTML = stages.map((stage) => `<section class="kanban-column"><h3>${stage}<span>${visible.filter((lead) => lead.stage === stage).length}</span></h3>${visible.filter((lead) => lead.stage === stage).map((lead) => `<article class="lead-card clickable-record" data-lead-id="${lead.id}"><p>${lead.company || lead.name}</p><span>${lead.name} · ${lead.service}</span><strong>${money(lead.value)}</strong><small>${lead.next || 'Add next action'} · ${lead.source}</small><div class="record-actions"><button data-edit-lead="${lead.id}">Edit</button><button class="danger-link" data-delete-lead="${lead.id}">Remove</button></div></article>`).join('')}</section>`).join('');
    document.getElementById('overviewLeadList').innerHTML = leads.slice(0, 4).map((lead) => `<div class="mini-lead"><div><strong>${lead.company}</strong><span>${lead.service} · ${money(lead.value)}</span></div><span>${lead.stage}</span></div>`).join('');
    document.getElementById('leadBadge').textContent = leads.filter((lead) => lead.stage === 'New').length;
    document.getElementById('pipelineValue').textContent = money(leads.filter((lead) => lead.stage !== 'Lost').reduce((sum, lead) => sum + Number(lead.value || 0), 0));
  }
  document.getElementById('leadSearch').addEventListener('input', renderLeads);
  document.getElementById('leadFilter').addEventListener('change', renderLeads);

  function renderProjects() {
    const table = document.getElementById('projectTable');
    table.innerHTML = `<div class="project-row project-row-pro header"><span>Project</span><span>Stage</span><span>Service</span><span>Due</span><span>Value</span><span>Status</span></div>${projects.map((project) => `<div class="project-row project-row-pro clickable-record"><div><strong>${escapeHTML(project.title)}</strong><small>${escapeHTML(project.location || 'Location not set')}</small></div><span>${escapeHTML(titleCase(project.stage))}</span><span class="badge">${escapeHTML(titleCase(project.service))}</span><span>${project.deadline_at ? new Date(project.deadline_at).toLocaleDateString('en-CA') : '—'}</span><strong>${money(project.value || 0)}</strong><span class="status">Active</span></div>`).join('') || '<p class="empty-state">No projects yet. Booked work will appear here.</p>'}`;
  }
  function renderClients() {
    document.getElementById('clientGrid').innerHTML = clients.map((client) => `<article class="client-card clickable-record"><div class="avatar">${escapeHTML(client.displayName.slice(0, 2).toUpperCase())}</div><strong>${escapeHTML(client.displayName)}</strong><span>${escapeHTML(client.industry || 'Client')}</span><span>${escapeHTML(client.email || client.phone || 'No contact details')}</span></article>`).join('') || '<p class="empty-state">No clients yet. Convert a qualified lead when they book.</p>';
  }
  function renderTasks() {
    document.getElementById('taskBoard').innerHTML = tasks.map((task) => `<label><input type="checkbox" ${task.completed_at ? 'checked' : ''} disabled /><span>${escapeHTML(task.title)}</span><em>${escapeHTML(task.category || 'Task')}</em><span>${task.due_at ? new Date(task.due_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'No due date'}</span></label>`).join('') || '<p class="empty-state">No tasks due.</p>';
  }
  document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  const modal = document.getElementById('leadModal');
  document.querySelectorAll('[data-open-modal]').forEach((button) => button.addEventListener('click', () => showToast('New website requests appear here automatically.', 'neutral')));
  document.getElementById('newLeadForm').addEventListener('submit', function (event) {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    showToast('Manual lead creation will be connected next.', 'neutral');
    event.currentTarget.reset();
    modal.close();
    switchView('leads');
  });

  document.getElementById('leadKanban').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-lead]');
    const remove = event.target.closest('[data-delete-lead]');
    if (edit) {
      const lead = leads.find((item) => String(item.id) === edit.dataset.editLead);
      openQuickEdit('Update lead', 'Next action', lead.next || '', async (nextAction) => {
        try {
          await supabaseUpdate('leads', lead.id, { next_action: nextAction || null, updated_at: new Date().toISOString() });
          lead.next = nextAction || 'No next action'; renderLeads(); showToast('Lead updated');
        } catch (error) { showToast(error.message, 'warning'); }
      });
    }
    if (remove) showToast('Lead deletion is disabled for your protection.', 'warning');
  });

  const notificationTrigger = document.getElementById('notificationTrigger');
  const notificationDrawer = document.getElementById('notificationDrawer');
  const notificationCount = document.getElementById('notificationCount');

  function toggleNotifications(force) {
    const shouldOpen = typeof force === 'boolean' ? force : !notificationDrawer.classList.contains('open');
    notificationDrawer.classList.toggle('open', shouldOpen);
    notificationDrawer.setAttribute('aria-hidden', String(!shouldOpen));
    notificationTrigger.setAttribute('aria-expanded', String(shouldOpen));
  }
  notificationTrigger.addEventListener('click', () => toggleNotifications());
  document.getElementById('closeNotifications').addEventListener('click', () => toggleNotifications(false));
  document.getElementById('markRead').addEventListener('click', function () {
    document.querySelectorAll('.notification-item').forEach((item) => item.classList.remove('unread'));
    notificationCount.textContent = '0';
    notificationCount.hidden = true;
  });

  async function requestBrowserAlerts() {
    if (!('Notification' in window)) {
      showToast('Browser notifications are not supported on this device.', 'warning');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('ShotByDiallo Studio', { body: 'Notifications are active. You will be alerted about new leads, follow-ups and project risks.', icon: 'assets/images/logo/favicon.png' });
    }
  }
  document.getElementById('enablePush').addEventListener('click', requestBrowserAlerts);
  document.getElementById('testNotification').addEventListener('click', requestBrowserAlerts);

  const media = [
    ['image', 'Homepage hero poster', 'assets/images/hero/hero.jpg', 'Homepage · Hero'],
    ['video', 'Homepage background reel', 'assets/videos/hero-video.mp4', 'Homepage · Hero'],
    ['video', 'Artist reel', 'assets/videos/artist-reel.mp4', 'Work · Featured reel'],
    ['image', 'Music video cover', 'assets/images/work/music-video.jpg', 'Homepage · Selected work'],
    ['image', 'Business video cover', 'assets/images/work/brand-video.jpg', 'Homepage · Selected work'],
    ['image', 'Social campaign cover', 'assets/images/work/event-video.jpg', 'Homepage · Selected work'],
    ['image', 'Director portrait', 'assets/images/about/portrait-optimized.jpg', 'Homepage · About'],
  ];
  let managedMedia = [];
  function publicMediaUrl(path) { return `${supabaseConfig.url}/storage/v1/object/public/site-media/${path}`; }
  async function loadManagedMedia() {
    if (!supabaseConfig || !accessToken) return;
    const response = await fetch(`${supabaseConfig.url}/rest/v1/media_assets?select=*&order=updated_at.desc`, { headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${accessToken}` } });
    if (response.ok) { managedMedia = await response.json(); renderMedia(); }
  }
  function renderMedia() {
    const search = (document.getElementById('mediaSearch').value || '').toLowerCase();
    const type = document.getElementById('mediaFilter').value;
    const items = managedMedia.length ? managedMedia.map((item) => [item.media_type, item.name, publicMediaUrl(item.storage_path), item.website_placement, item.alt_text]) : media;
    document.getElementById('mediaGrid').innerHTML = items.filter((item) => (type === 'all' || item[0] === type) && item[1].toLowerCase().includes(search)).map((item, index) => `<article class="media-card">${item[0] === 'video' ? `<div class="video-file-placeholder"><span>▶</span><small>Video ready for the website</small></div><span class="media-type">Video</span>` : `<img src="${item[2]}" alt="${item[4] || ''}" loading="lazy" decoding="async" /><span class="media-type">Image</span>`}<div><strong>${item[1]}</strong><span>${item[3]}</span><code>${item[2]}</code><div class="record-actions"><button data-media-preview="${index}">Open</button></div></div></article>`).join('');
  }
  document.getElementById('mediaSearch').addEventListener('input', renderMedia);
  document.getElementById('mediaFilter').addEventListener('change', renderMedia);
  const mediaUploadModal = document.getElementById('mediaUploadModal');
  document.getElementById('addMediaButton').addEventListener('click', () => mediaUploadModal.showModal());
  document.getElementById('mediaUploadForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget); const file = form.get('file');
    if (!file || !supabaseConfig || !accessToken) return showToast('Sign in again before uploading.', 'warning');
    const placement = form.get('placement'); const path = `${placement}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const upload = await fetch(`${supabaseConfig.url}/storage/v1/object/site-media/${path}`, { method: 'POST', headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${accessToken}`, 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
    if (!upload.ok) return showToast('Upload failed. Check the media setup.', 'warning');
    const record = { name: file.name, media_type: file.type.startsWith('video/') ? 'video' : 'image', storage_path: path, website_placement: placement, alt_text: form.get('alt') || null, owner_id: (await fetch(`${supabaseConfig.url}/auth/v1/user`, { headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${accessToken}` } }).then(r => r.json())).id };
    const saved = await fetch(`${supabaseConfig.url}/rest/v1/media_assets?on_conflict=website_placement`, { method: 'POST', headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(record) });
    if (!saved.ok) return showToast('File uploaded, but placement could not be saved.', 'warning');
    mediaUploadModal.close(); event.currentTarget.reset(); await loadManagedMedia(); showToast('Media published to the website.');
  });
  document.getElementById('mediaGrid').addEventListener('click', (event) => {
    if (event.target.matches('[data-media-replace]')) showToast('Replacement uploads activate with Supabase Storage.', 'neutral');
    if (event.target.matches('[data-media-remove]')) confirmAction('Remove this media placement from the library?', () => event.target.closest('.media-card').remove());
    if (event.target.matches('[data-media-preview]')) window.open((managedMedia.length ? publicMediaUrl(managedMedia[Number(event.target.dataset.mediaPreview)].storage_path) : media[Number(event.target.dataset.mediaPreview)][2]), '_blank', 'noopener');
  });

  let audience = [
    ['CleanPro', 'client', 'info@cleanpro.ca', 'Newsletter', 'SHOT-CLEANPRO'],
    ['Kairo', 'client', 'kairo@email.com', 'Artist updates', 'SHOT-KAIRO'],
    ['Maison Naya', 'client', 'hello@maisonnaya.ca', 'Newsletter', 'SHOT-NAYA'],
    ['Nordik Construction', 'lead', 'marc@nordik.ca', 'Business leads', '—'],
    ['Le Sillage', 'client', 'marketing@lesillage.ca', 'Newsletter', 'SHOT-SILLAGE'],
  ];
  function renderAudience() {
    document.getElementById('audienceTable').innerHTML = `<div class="audience-row audience-row-pro header"><span>Contact</span><span>Type</span><span>List</span><span>Actions</span></div>${audience.map((contact, index) => `<div class="audience-row audience-row-pro clickable-record"><div><strong>${contact[0]}</strong><small>${contact[2]}</small></div><span class="badge">${contact[1]}</span><span>${contact[3]}</span><div class="record-actions"><button data-edit-contact="${index}">Edit</button><button class="danger-link" data-delete-contact="${index}">Remove</button></div></div>`).join('')}`;
  }
  renderAudience();
  document.getElementById('exportContacts').addEventListener('click', () => {
    const csv = ['Name,Type,Email,List,Referral', ...audience.map((row) => row.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'shotbydiallo-contacts.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  document.getElementById('addContactButton').addEventListener('click', () => showToast('Contact creation will persist when Supabase is connected.', 'neutral'));

  document.getElementById('audienceTable').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-contact]');
    const remove = event.target.closest('[data-delete-contact]');
    if (edit) {
      const index = Number(edit.dataset.editContact);
      openQuickEdit('Edit contact', 'Contact name', audience[index][0], (name) => { if (name) { audience[index][0] = name; renderAudience(); } });
    }
    if (remove) confirmAction('Remove this contact from the CRM and mailing lists?', () => { audience.splice(Number(remove.dataset.deleteContact), 1); renderAudience(); });
  });

  const referralClient = document.getElementById('referralClient');
  const generatedReferralCode = document.getElementById('generatedReferralCode');
  const referralProjectLink = document.getElementById('referralProjectLink');
  function updateReferralCode() {
    const slug = referralClient.value.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 14);
    const code = `SBD-${slug}-10`;
    generatedReferralCode.textContent = code;
    referralProjectLink.value = `${window.location.origin}/contact.html?ref=${encodeURIComponent(code)}`;
  }
  referralClient.addEventListener('change', updateReferralCode);
  document.getElementById('copyReferralCode').addEventListener('click', async () => {
    await navigator.clipboard.writeText(generatedReferralCode.textContent);
    showToast('Referral code copied');
  });
  document.getElementById('copyReferralLink').addEventListener('click', async () => {
    await navigator.clipboard.writeText(referralProjectLink.value);
    showToast('Project request link copied');
  });
  document.getElementById('prepareReferralMessage').addEventListener('click', () => {
    const message = `Hi ${referralClient.value},\n\nThank you again for trusting ShotByDiallo. Here is your personal referral link:\n${referralProjectLink.value}\n\nWhen someone books using your code, they receive 10% off their first project and you receive 10% off your next project.\n\nI appreciate your support.`;
    document.getElementById('sequenceMessageTitle').textContent = 'Referral message';
    document.getElementById('sequenceMessageBody').value = message;
    document.getElementById('sequenceMessageModal').showModal();
  });
  updateReferralCode();

  const retentionMessages = {
    7: `Hi [CLIENT NAME],\n\nThank you again for trusting ShotByDiallo with your project. I hope you are enjoying the final result.\n\nAs a thank-you, you now receive 10% off your next project. If you refer someone using your personal link, they will also receive 10% off their first project.\n\nYour referral link:\n[REFERRAL LINK]\n\nI truly appreciate your support.`,
    14: `Hi [CLIENT NAME],\n\nI wanted to check that everything is going well with the final content. If you enjoyed working with ShotByDiallo, would you mind leaving a short Google review?\n\n[GOOGLE REVIEW LINK]\n\nYour feedback helps other artists and businesses feel confident choosing us. Thank you.`,
    30: `Hi [CLIENT NAME],\n\nI hope you are doing well. I wanted to check how the video has been performing and whether you have any upcoming releases, campaigns or projects.\n\nIf you would like to plan something new, you can submit the idea here:\n[PROJECT REQUEST LINK]\n\nYour 10% returning-client offer is still available.`
  };
  document.querySelectorAll('[data-preview-sequence]').forEach((button) => button.addEventListener('click', () => {
    const day = button.dataset.previewSequence;
    document.getElementById('sequenceMessageTitle').textContent = `Day ${day} follow-up`;
    document.getElementById('sequenceMessageBody').value = retentionMessages[day];
    document.getElementById('sequenceMessageModal').showModal();
  }));
  document.getElementById('copySequenceMessage').addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.getElementById('sequenceMessageBody').value);
    showToast('Message copied');
  });
  document.getElementById('editRetentionSequence').addEventListener('click', () => showToast('Open any message to edit its wording before automation is activated.', 'neutral'));

  const messageModal = document.getElementById('messageModal');
  const messageType = document.getElementById('messageType');
  const messageClient = document.getElementById('messageClient');
  const messageLink = document.getElementById('messageLink');
  const messageBody = document.getElementById('messageBody');
  const templates = {
    preview: (client, link) => `Hi ${client},\n\nYour project preview is ready. You can review it here:\n${link || '[ADD PREVIEW LINK]'}\n\nPlease send your feedback in one clear list so I can keep the revision process organized.\n\nThank you,\nShotByDiallo`,
    delivery: (client, link) => `Hi ${client},\n\nYour final files are ready. You can download everything here:\n${link || '[ADD DELIVERY LINK]'}\n\nPlease save a copy before the link expires. Thank you for trusting ShotByDiallo with this project.`,
    complete: (client, link) => `Hi ${client},\n\nYour project is officially complete. It was a pleasure creating this with you.\n\nFinal delivery: ${link || '[ADD DELIVERY LINK]'}\n\nIf you need new versions or another campaign, reply anytime.`,
    review: (client) => `Hi ${client},\n\nThank you again for working with ShotByDiallo. If you enjoyed the experience, would you mind leaving a short Google review? It helps other clients find my work.\n\n[ADD REVIEW LINK]\n\nI appreciate your support.`,
  };
  function updateMessage() {
    messageBody.value = templates[messageType.value](messageClient.value, messageLink.value);
    document.getElementById('emailMessage').href = `mailto:?subject=${encodeURIComponent(`ShotByDiallo · ${messageType.options[messageType.selectedIndex].text}`)}&body=${encodeURIComponent(messageBody.value)}`;
  }
  document.querySelectorAll('[data-client-update]').forEach((button) => button.addEventListener('click', () => {
    const option = Array.from(messageClient.options).find((item) => item.text.toLowerCase().includes(button.dataset.clientUpdate.toLowerCase()));
    if (option) messageClient.value = option.value;
    updateMessage();
    messageModal.showModal();
  }));
  [messageType, messageClient, messageLink].forEach((field) => field.addEventListener('input', updateMessage));
  document.getElementById('copyMessage').addEventListener('click', async () => {
    await navigator.clipboard.writeText(messageBody.value);
    document.getElementById('copyMessage').textContent = 'Copied';
  });
  updateMessage();

  let invoices = JSON.parse(localStorage.getItem('sbd-invoices') || 'null') || [
    { invoice: '#1042', client: 'CleanPro', amount: 1800, status: 'Due', method: 'E-transfer' },
    { invoice: '#1041', client: 'Le Sillage', amount: 2700, status: 'Paid', method: 'E-transfer' },
    { invoice: '#1040', client: 'Amina', amount: 1800, status: 'Overdue', method: 'E-transfer' },
  ];
  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
  }
  function renderInvoices() {
    document.getElementById('invoiceList').innerHTML = invoices.map((item, index) => `<div class="invoice-row invoice-row-actions"><span>${escapeHTML(item.invoice)} · ${escapeHTML(item.client)}<small>${escapeHTML(item.method)}</small></span><strong>${money(item.amount)}</strong><b class="badge ${item.status === 'Paid' ? 'success' : item.status === 'Overdue' ? 'danger' : 'warning'}">${escapeHTML(item.status)}</b><button data-receipt="${index}">Receipt</button></div>`).join('');
  }
  const transactionModal = document.getElementById('transactionModal');
  document.getElementById('addTransactionButton').addEventListener('click', () => transactionModal.showModal());
  document.getElementById('transactionForm').addEventListener('submit', function (event) {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    invoices.unshift({ invoice: data.get('invoice'), client: data.get('client'), amount: Number(data.get('amount')), status: data.get('status'), method: data.get('method') });
    localStorage.setItem('sbd-invoices', JSON.stringify(invoices));
    renderInvoices();
    event.currentTarget.reset();
    transactionModal.close();
    showReceipt(invoices[0]);
  });

  const receiptModal = document.getElementById('receiptModal');
  function showReceipt(item) {
    const receiptNumber = `REC-${Date.now().toString().slice(-6)}`;
    document.getElementById('receiptDocument').innerHTML = `<header><div><p>SHOTBYDIALLO</p><h1>Reçu de paiement</h1></div><strong>${receiptNumber}</strong></header><section><p><span>Reçu de</span><strong>${escapeHTML(item.client)}</strong></p><p><span>Facture</span><strong>${escapeHTML(item.invoice)}</strong></p><p><span>Date</span><strong>${new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(new Date())}</strong></p><p><span>Méthode</span><strong>${escapeHTML(item.method)}</strong></p></section><div class="receipt-total"><span>Montant reçu</span><strong>${money(item.amount)}</strong></div><footer><p>Ce reçu confirme le paiement enregistré pour les services de ShotByDiallo.</p><p>Abdourahmane Diallo · ShotByDiallo · Montréal, Québec</p></footer>`;
    receiptModal.showModal();
  }
  document.getElementById('invoiceList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-receipt]');
    if (button) showReceipt(invoices[Number(button.dataset.receipt)]);
  });
  document.getElementById('printReceipt').addEventListener('click', () => window.print());

  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => {
    const dialog = button.closest('dialog');
    if (dialog) dialog.close();
  }));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  }));

  const contractModal = document.getElementById('contractModal');
  const contractPreviewModal = document.getElementById('contractPreviewModal');
  const contractForm = document.getElementById('contractForm');
  let latestContractHTML = '';
  let contracts = [
    { title: 'Business company story', client: 'CleanPro', amount: 3600, status: 'Signed', className: 'success', date: '2026-08-12' },
    { title: 'Music video production', client: 'Kairo', amount: 3200, status: 'Sent', className: 'warning', date: '2026-08-08' },
    { title: 'Restaurant campaign', client: 'Le Sillage', amount: 5400, status: 'Draft', className: '', date: '2026-08-02' },
  ];
  function archivedContractHTML(contract) {
    return `<header><p>SHOTBYDIALLO</p><h1>CONTRAT DE PRESTATION</h1><span>Document ${escapeHTML(contract.status.toLowerCase())}</span></header><h2>Entre les parties</h2><p><strong>Prestataire :</strong> ShotByDiallo, représenté par Abdourahmane Diallo.</p><p><strong>Client :</strong> ${escapeHTML(contract.client)}.</p><h2>1. Objet</h2><p>Production : <strong>${escapeHTML(contract.title)}</strong>.</p><h2>2. Tarification</h2><p>Montant total : <strong>${money(contract.amount)}</strong>.</p><h2>3. Statut du document</h2><p>${escapeHTML(contract.status)} · Service prévu le ${escapeHTML(contract.date)}.</p><div class="signature-grid"><div><span>Signature du Prestataire</span><strong>Abdourahmane Diallo</strong><i></i></div><div><span>Signature du Client</span><strong>${escapeHTML(contract.client)}</strong><i></i></div></div>`;
  }
  function renderContracts() {
    document.getElementById('contractList').innerHTML = contracts.map((contract, index) => `<div class="contract-row clickable-record"><strong>${escapeHTML(contract.title)}</strong><span>${escapeHTML(contract.client)}</span><span>${money(contract.amount)}</span><b class="badge ${contract.className}">${escapeHTML(contract.status)}</b><div class="record-actions"><button data-preview-contract="${index}">Open</button><button data-edit-contract="${index}">Edit</button><button class="danger-link" data-delete-contract="${index}">Remove</button></div></div>`).join('');
  }
  renderContracts();
  function buildContract() {
    const data = Object.fromEntries(new FormData(contractForm).entries());
    if (!contractForm.reportValidity()) return '';
    const amount = Number(data.amount || 0);
    const deposit = amount * Number(data.deposit_percent || 0) / 100;
    const balance = amount - deposit;
    const formattedDate = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(new Date(`${data.service_date}T12:00:00`));
    const createdDate = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(new Date());
    const portfolioClause = data.portfolio_rights ? 'Le Prestataire conserve le droit d’utiliser certains extraits vidéo ou certaines images à des fins de portfolio, réseaux sociaux, site web ou promotion professionnelle, sauf demande écrite contraire du Client.' : 'Le Prestataire ne publiera pas les contenus du projet sans l’autorisation écrite du Client.';
    latestContractHTML = `<header><p>SHOTBYDIALLO</p><h1>CONTRAT DE PRESTATION</h1><span>Production photo et vidéo</span></header>
      <h2>Entre les parties</h2><p><strong>Prestataire :</strong> ShotByDiallo, représenté par Abdourahmane Diallo, ci-après « le Prestataire ».</p><p><strong>Client :</strong> ${escapeHTML(data.client)}, ci-après « le Client ».</p><p>Les parties conviennent de ce qui suit :</p>
      <h2>1. Objet</h2><p>Le présent contrat a pour objet la réalisation de la prestation suivante : <strong>${escapeHTML(data.title)}</strong>.</p><p>${escapeHTML(data.scope).replace(/\n/g, '<br>')}</p>
      <h2>2. Détails de la prestation</h2><ul><li><strong>Date :</strong> ${formattedDate}</li><li><strong>Lieu :</strong> ${escapeHTML(data.location)}</li><li><strong>Horaire :</strong> ${escapeHTML(data.schedule || 'À confirmer avec le Client')}</li></ul>
      <h2>3. Livrables</h2><p>${escapeHTML(data.deliverables).replace(/\n/g, '<br>')}</p><p>Le Client bénéficie de <strong>${escapeHTML(data.revisions)} révision(s)</strong> raisonnable(s). Toute demande supplémentaire ou modification majeure non prévue pourra faire l’objet de frais additionnels.</p>
      <h2>4. Tarification et paiement</h2><ul><li><strong>Montant total :</strong> ${money(amount)}</li><li><strong>Acompte à la signature (${escapeHTML(data.deposit_percent)} %) :</strong> ${money(deposit)}</li><li><strong>Solde restant :</strong> ${money(balance)}, payable ${escapeHTML(data.balance_due).toLowerCase()}.</li></ul><p>L’acompte est non remboursable, sauf en cas d’annulation par le Prestataire. La date est réservée uniquement après réception de l’acompte.</p>
      <h2>5. Livraison</h2><p>Les contenus finaux seront remis dans un délai maximal de <strong>${escapeHTML(data.delivery_delay)}</strong>. La livraison se fera via un lien de téléchargement ou tout autre support convenu entre les parties.</p>
      <h2>6. Droits d’utilisation</h2><p>Les contenus sont destinés à l’usage convenu avec le Client. ${portfolioClause}</p>
      <h2>7. Responsabilités</h2><p>Le Prestataire s’engage à fournir son matériel et à exécuter la prestation de manière professionnelle. Le Client s’engage à respecter les horaires, communiquer tout changement, fournir les informations et autorisations nécessaires et assurer un accès adéquat aux lieux.</p><p>Le Prestataire ne peut être tenu responsable des éléments hors de son contrôle, notamment les retards, restrictions du lieu, conditions météorologiques, problèmes d’accès ou changements de programme non communiqués.</p>
      <h2>8. Annulation ou report</h2><p>En cas d’annulation par le Client, l’acompte demeure non remboursable. En cas de report, le Prestataire fera son possible pour transférer l’acompte à une nouvelle date, sous réserve de disponibilité. En cas d’annulation par le Prestataire, l’acompte sera remboursé.</p>
      ${data.notes ? `<h2>9. Notes et conditions particulières</h2><p>${escapeHTML(data.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <h2>Acceptation</h2><p>Les parties reconnaissent avoir lu, compris et accepté les conditions du présent contrat.</p><p>Fait à Montréal, le ${createdDate}.</p>
      <div class="signature-grid"><div><span>Signature du Prestataire</span><strong>Abdourahmane Diallo – ShotByDiallo</strong><i></i></div><div><span>Signature du Client</span><strong>${escapeHTML(data.client)}</strong><i></i></div></div>`;
    return latestContractHTML;
  }
  document.getElementById('newContractButton').addEventListener('click', () => contractModal.showModal());
  document.getElementById('previewContract').addEventListener('click', () => {
    const html = buildContract();
    if (!html) return;
    document.getElementById('contractDocument').innerHTML = html;
    contractPreviewModal.showModal();
  });
  document.getElementById('saveContractDraft').addEventListener('click', () => {
    const html = buildContract();
    if (!html) return;
    const drafts = JSON.parse(localStorage.getItem('sbd-contract-drafts') || '[]');
    drafts.unshift({ createdAt: new Date().toISOString(), html });
    localStorage.setItem('sbd-contract-drafts', JSON.stringify(drafts));
    showToast('Contract draft saved');
  });
  document.getElementById('prepareContractEmail').addEventListener('click', () => {
    const html = buildContract();
    if (!html) return;
    const client = document.getElementById('contractClient').value;
    window.location.href = `mailto:?subject=${encodeURIComponent(`Contrat ShotByDiallo · ${client}`)}&body=${encodeURIComponent(`Bonjour ${client},\n\nVotre contrat ShotByDiallo est prêt pour révision et signature.\n\n[JOINDRE LE PDF OU AJOUTER LE LIEN DE SIGNATURE]\n\nMerci,\nAbdourahmane Diallo`)}`;
  });
  document.getElementById('printContract').addEventListener('click', () => window.print());
  document.getElementById('contractList').addEventListener('click', (event) => {
    const preview = event.target.closest('[data-preview-contract]');
    const edit = event.target.closest('[data-edit-contract]');
    const remove = event.target.closest('[data-delete-contract]');
    if (preview) {
      document.getElementById('contractDocument').innerHTML = archivedContractHTML(contracts[Number(preview.dataset.previewContract)]);
      contractPreviewModal.showModal();
    }
    if (edit) {
      const contract = contracts[Number(edit.dataset.editContract)];
      document.getElementById('contractClient').value = contract.client;
      contractForm.elements.title.value = contract.title;
      contractForm.elements.amount.value = contract.amount;
      contractForm.elements.service_date.value = contract.date;
      contractModal.showModal();
    }
    if (remove) confirmAction('Remove this contract from the document archive?', () => { contracts.splice(Number(remove.dataset.deleteContract), 1); renderContracts(); });
  });

  document.querySelectorAll('.task-board label, .marketing-ideas label').forEach((row) => {
    const actions = document.createElement('span');
    actions.className = 'inline-row-actions';
    actions.innerHTML = '<button type="button" data-row-edit>Edit</button><button type="button" class="danger-link" data-row-remove>Remove</button>';
    row.appendChild(actions);
  });
  document.addEventListener('click', (event) => {
    if (event.target.matches('[data-row-remove]')) confirmAction('Remove this task or marketing action?', () => event.target.closest('label').remove());
    if (event.target.matches('[data-row-edit]')) {
      const row = event.target.closest('label');
      const textNode = Array.from(row.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      openQuickEdit('Edit item', 'Description', textNode?.textContent.trim() || '', (updated) => { if (updated && textNode) textNode.textContent = ` ${updated} `; });
    }
  });
  document.getElementById('saveSettings').addEventListener('click', () => showToast('Back-office settings saved'));

  document.addEventListener('click', function (event) {
    if (!notificationDrawer.contains(event.target) && !notificationTrigger.contains(event.target)) toggleNotifications(false);
  });
  if (accessToken) {
    fetch('/api/crm-config').then((response) => response.ok ? response.json() : Promise.reject()).then(async (config) => {
      supabaseConfig = config; await loadRealLeads(); await loadOperations(); await loadManagedMedia(); authGate.hidden = true; crmApp.hidden = false;
    }).catch(() => { sessionStorage.removeItem('sbd-admin-token'); });
  }
});
