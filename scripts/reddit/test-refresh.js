const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const fetch = require('node-fetch');

const id  = (process.env.REDDIT_CLIENT_ID || '').trim();
const sec = (process.env.REDDIT_CLIENT_SECRET || '').trim();
const tok = (process.env.REDDIT_REFRESH_TOKEN || '').trim();
const mode= (process.env.REDDIT_APP_TYPE || 'installed').trim();

if (!id || !tok) { console.error('Missing REDDIT_CLIENT_ID or REDDIT_REFRESH_TOKEN'); process.exit(1); }
const basic = Buffer.from(`${id}:${mode === 'web' ? sec : ''}`).toString('base64');

(async () => {
  let res;
  try {
    res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'User-Agent': 'TrenchesBot/1.0 by Trenches',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok })
    });
  } catch (e) {
    res = { ok: false, status: 0, text: async () => String(e) };
  }
  const body = await res.text();
  console.log(JSON.stringify({ ok: res.ok, status: res.status, body: body.slice(0,300) }));
})();
