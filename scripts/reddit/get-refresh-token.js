const http = require('http');
const open = require('open');
const fetch = require('node-fetch');

const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:8585/callback';
const PORT = 8585;
const STATE = Math.random().toString(36).slice(2);

if (!CLIENT_ID) {
  console.error('Set REDDIT_CLIENT_ID env var first.');
  process.exit(1);
}

const authUrl =
  'https://www.reddit.com/api/v1/authorize?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: STATE,
    redirect_uri: REDIRECT_URI,
    duration: 'permanent',
    scope: 'read'
  }).toString();

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/callback')) {
    res.writeHead(404).end();
    return;
  }
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (!code || state !== STATE) {
    res.writeHead(400).end('Invalid code/state');
    server.close();
    return;
  }

  try {
    // Support both app types: with secret (web app) or no secret (installed app)
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      })
    });
    const json = await tokenRes.json();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('You can close this tab. Check the terminal for your REFRESH TOKEN.');
    console.log('\nREDDIT_REFRESH_TOKEN =', json.refresh_token || '(not returned)');
  } catch (e) {
    console.error('Token exchange failed:', e);
    try {
      res.writeHead(500).end('Token exchange failed.');
    } catch {}
  } finally {
    server.close();
  }
});

server.listen(PORT, async () => {
  console.log('Opening browser for Reddit authorization…');
  try {
    await open(authUrl);
  } catch (e) {
    console.error('Failed to open browser. Visit this URL manually:\n', authUrl);
  }
});

