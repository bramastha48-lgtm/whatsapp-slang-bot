const { Client, LocalAuth } = require('whatsapp-web.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// ============================================
//  GROQ AI
// ============================================

const GROQ_KEYS = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5,
].filter(Boolean);

let currentKeyIndex = 0;
function getNextKey() {
  if (GROQ_KEYS.length === 0) return null;
  const key = GROQ_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;
  return key;
}

async function askAI(userMessage) {
  if (GROQ_KEYS.length === 0) return 'API key belum dikonfigurasi.';
  const systemPrompt = 'Kamu adalah bot WhatsApp yang pintar dan santai. DETEKSI OTOMATIS apakah user minta terjemahan, saran slang, atau penjelasan singkatan. Terjemahkan dari bahasa apapun ke bahasa apapun (default: Inggris). Kasih padanan bahasa gaul Inggris dari kata Indonesia. Jelaskan singkatan internet slang (cz, rn, ngl, tbh, fr, ong, dll). Kalau user ngobrol biasa, balas santai. Santai tapi sopan, pakai emoji, jangan terlalu panjang.';
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = getNextKey();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.7, max_tokens: 1024 }),
      });
      if (res.status !== 200) continue;
      const data = JSON.parse(await res.text());
      const r = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (r) return r;
    } catch (e) {}
  }
  return 'Maaf, API sedang bermasalah. Coba lagi nanti ya~';
}

// ============================================
//  SESSION - AUTO SAVE/LOAD VIA GITHUB GIST
// ============================================

const GIST_TOKEN = process.env.GIST_TOKEN || 'ghp_q0…IFyN';
const SESSION_DIR = path.join(__dirname, 'session_data');

async function saveSession() {
  try {
    console.log('Save session ke Gist...');
    const files = {};
    const walk = (dir, prefix) => {
      if (!fs.existsSync(dir)) return;
      let items; try { items = fs.readdirSync(dir); } catch(e) { return; }
      for (const item of items) {
        const full = path.join(dir, item);
        const rel = prefix ? prefix + '/' + item : item;
        try {
          const stat = fs.lstatSync(full);
          if (stat.isSymbolicLink()) continue;
          if (stat.isDirectory()) { walk(full, rel); }
          else if (stat.size < 50000) { files[rel] = fs.readFileSync(full).toString('base64'); }
        } catch(e) {}
      }
    };
    walk(SESSION_DIR, '');
    const count = Object.keys(files).length;
    console.log('File session: ' + count);
    if (count === 0) return;

    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + GIST_TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'wa-bot' },
      body: JSON.stringify({ description: 'WA Bot Session', files: { 'session.json': { content: JSON.stringify(files) } } }),
    });
    const gist = await res.json();
    if (gist.id) {
      console.log('========================================');
      console.log('SESSION TERSIMPAN! GIST_ID = ' + gist.id);
      console.log('Tambahkan GIST_ID=' + gist.id + ' di Railway Variables');
      console.log('========================================');
    } else {
      console.log('Gagal: ' + JSON.stringify(gist).substring(0, 200));
    }
  } catch(e) { console.log('Error save: ' + String(e)); }
}

async function restoreSession() {
  const gistId = process.env.GIST_ID;
  if (!gistId) { console.log('GIST_ID belum diset, scan QR baru'); return; }
  try {
    console.log('Restore session dari Gist ' + gistId + '...');
    const res = await fetch('https://api.github.com/gists/' + gistId, {
      headers: { 'Authorization': 'Bearer ' + GIST_TOKEN, 'User-Agent': 'wa-bot' }
    });
    const gist = await res.json();
    const file = gist.files && gist.files['session.json'];
    if (!file) { console.log('Session tidak ditemukan'); return; }
    const data = JSON.parse(file.content);
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    for (const [fp, content] of Object.entries(data)) {
      const full = path.join(SESSION_DIR, fp);
      const dir = path.dirname(full);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(full, Buffer.from(content, 'base64'));
    }
    console.log('Session berhasil di-restore!');
  } catch(e) { console.log('Gagal restore: ' + String(e)); }
}

// ============================================
//  WHATSAPP CLIENT
// ============================================

// Restore session sebelum init
restoreSession();

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  },
});

client.on('qr', (qr) => {
  console.log('========================================');
  console.log('SCAN QR: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qr));
  console.log('========================================');
});

client.on('ready', async () => {
  console.log('Bot WhatsApp siap!');
  console.log('Groq keys: ' + GROQ_KEYS.length);
  // Auto-save session ke Gist
  if (GIST_TOKEN) await saveSession();
});

client.on('authenticated', () => console.log('Autentikasi berhasil!'));
client.on('auth_failure', (msg) => console.log('Auth gagal: ' + msg));
client.on('disconnected', (reason) => console.log('Terputus: ' + reason));

// ============================================
//  HANDLE PESAN
// ============================================

const busy = {};

client.on('message', async (message) => {
  try {
    const body = message.body ? message.body.trim() : '';
    if (!body || message.from === 'status@broadcast') return;
    if (message.from.endsWith('@g.us') && (!message.mentionedIds || !message.mentionedIds.length)) return;
    if (busy[message.from]) { await message.reply('Sabar ya, masih proses...'); return; }
    busy[message.from] = true;
    try {
      const chat = await message.getChat();
      await chat.sendStateTyping();
      const reply = await askAI(body);
      await message.reply(reply);
    } catch(e) { await message.reply('Error: ' + String(e)); }
    finally { delete busy[message.from]; }
  } catch(e) {}
});

// Memory limit
setInterval(() => {
  const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (global.gc) global.gc();
  if (mb > 300) { console.log('Memory ' + mb + 'MB, restart'); process.exit(1); }
}, 60000);

console.log('Memulai bot...');
client.initialize();

process.on('SIGTERM', async () => { await client.destroy(); process.exit(0); });
process.on('uncaughtException', (e) => console.log('Err: ' + String(e)));
