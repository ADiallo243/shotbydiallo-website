const MAX_LENGTHS = {
  name: 120,
  company: 160,
  email: 254,
  phone: 60,
  budget: 80,
  projectDate: 120,
  projectLocation: 200,
  brief: 5000,
  referenceUrl: 2048,
  source: 80,
  contactPreference: 40,
  referralCode: 80,
};

const SERVICE_MAP = {
  'Music video': 'music_video',
  'Business video': 'business_video',
  'Monthly content': 'monthly_content',
  Other: 'other',
};

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function respond(response, status, body) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

function requestBody(request) {
  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  return request.body || {};
}

function validReferenceUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = async function createLead(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return respond(response, 405, { error: 'Method not allowed.' });
  }

  const body = requestBody(request);

  // Quietly accept obvious automated submissions without storing their data.
  if (text(body.website, 200)) {
    return respond(response, 201, { ok: true });
  }

  const lead = {
    name: text(body.name, MAX_LENGTHS.name),
    company: text(body.company, MAX_LENGTHS.company) || null,
    email: text(body.email, MAX_LENGTHS.email).toLowerCase(),
    phone: text(body.phone, MAX_LENGTHS.phone) || null,
    service: SERVICE_MAP[text(body.project_type, 80)],
    budget_range: text(body.budget, MAX_LENGTHS.budget) || null,
    project_date: text(body.project_date, MAX_LENGTHS.projectDate) || null,
    project_location: text(body.project_location, MAX_LENGTHS.projectLocation) || null,
    brief: text(body.message, MAX_LENGTHS.brief),
    reference_url: text(body.reference_link, MAX_LENGTHS.referenceUrl) || null,
    source: text(body.lead_source, MAX_LENGTHS.source) || null,
    contact_preference:
      text(body.contact_preference, MAX_LENGTHS.contactPreference) || null,
    referral_code: text(body.referral_code, MAX_LENGTHS.referralCode) || null,
  };

  if (!lead.name || !lead.email || !lead.service || !lead.brief) {
    return respond(response, 400, { error: 'Please complete all required fields.' });
  }
  if (!/^\S+@\S+\.\S+$/.test(lead.email)) {
    return respond(response, 400, { error: 'Please enter a valid email address.' });
  }
  if (!validReferenceUrl(lead.reference_url)) {
    return respond(response, 400, { error: 'Please enter a valid reference link.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.SHOTBYDIALLO_OWNER_ID;
  if (!supabaseUrl || !serviceRoleKey || !ownerId) {
    return respond(response, 503, {
      error: 'Project requests are temporarily unavailable. Please email bydialloo@gmail.com.',
    });
  }

  let insertResponse;
  try {
    insertResponse = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...lead, owner_id: ownerId }),
    });
  } catch {
    return respond(response, 502, {
      error: 'Unable to save your request. Please email bydialloo@gmail.com.',
    });
  }

  if (!insertResponse.ok) {
    return respond(response, 502, {
      error: 'Unable to save your request. Please email bydialloo@gmail.com.',
    });
  }

  return respond(response, 201, { ok: true });
};
