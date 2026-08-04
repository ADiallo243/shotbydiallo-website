module.exports = async function crmConfig(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response.status(503).json({ error: 'CRM is not configured.' });
  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({ url, key });
};
