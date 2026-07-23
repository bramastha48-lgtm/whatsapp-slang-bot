const { Client, LocalAuth } = require('whatsapp-web.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// ============================================
//  CONFIG
// ============================================

const GROQ_KEYS = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5,
].filter(Boolean);

let keyIdx = 0;
function nextKey() {
  if (!GROQ_KEYS.length) return null;
  const k = GROQ_KEYS[keyIdx];
  keyIdx = (keyIdx + 1) % GROQ_KEYS.length;
  return k;
}

// ============================================
//  GROQ AI
// ============================================

async function askAI(msg) {
  if (!GROQ_KEYS.length) return '❌ API key belum dikonfigurasi.';

  const sys = `Kamu adalah bot WhatsApp yang pintar dan santai. Tugasmu:

1. DETEKSI OTOMATIS apakah user minta terjemahan, saran slang, atau penjelasan singkatan.
2. Terjemahkan dari bahasa apapun ke bahasa apapun (default Inggris).
3. Kasih padanan bahasa gaul Inggris dari kata Indonesia.
4. Jelaskan singkatan internet slang (cz, rn, ngl, tbh, fr, ong, dll).
5. Kalau user ngobrol biasa, balas santai dan ramah.

Aturan penting:
- Terjemahan harus KALIMAT UTUH yang natural, BUKAN kata per kata.
- Contoh benar: "kenapa kamu tidak chat aku?" -> "Why haven't you messaged me?"
- Contoh salah: "Kenapa -> Why, kamu -> you" (JANGAN seperti ini)
- JANGAN gunakan format *bold* atau _italic_ karena WhatsApp tidak mendukungnya dengan baik.
- JANGAN tambahkan adegan/roleplay seperti *guling-gulingan*, *canggung*, *bingung* dll.
- Jika kasih contoh, gunakan format bernomor: 1. 2. 3. dst.
- Santai, pakai emoji, jangan terlalu panjang, tulis dengan rapi dan jelas.`;

  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = nextKey();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': '***' + key,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: msg }
          ],
          temperature: 0.7,
          max_tokens: 1024
        })
      });

      if (res.status !== 200) {
        console.log('Groq ' + res.status + ': ' + (await res.text()).substring(0, 100));
        continue;
      }

      const data = JSON.parse(await res.text());
      const r = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (r) return r;
    } catch (e) {
      console.log('Groq error: ' + e.message);
    }
  }
  return '⚠️ API sedang bermasalah. Coba lagi nanti ya~';
}

// ============================================
//  SESSION VIA GITHUB GIST
// ============================================

const GITHUB_TOKEN = proces…OKEN || '';
const SESSION_DIR = path.join(__dirname, 'session_data');

async function saveSession() {
  try {
    console.log('Save session...');
    const files = {};
    const walk = (dir, prefix) => {
      if (!fs.existsSync(dir)) return;
      let items;
      try { items = fs.readdirSync(dir); } catch (e) { return; }
      for (const item of items) {
        const full = path.join(dir, item);
        const rel = prefix ? prefix + '/' + item : item;
        try {
          const st = fs.lstatSync(full);
          if (st.isSymbolicLink()) continue;
          if (st.isDirectory()) { walk(full, rel); }
          else if (st.size < 100000) { files[rel] = fs.readFileSync(full).toString('base64'); }
        } catch (e) {}
      }
    };
    walk(SESSION_DIR, '');
    const count = Object.keys(files).length;
    console.log('File session: ' + count);
    if (!count) return;

    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': '***' + GITHUB_TOKEN,
        'Content-Type': 'application/json',
        'User-Agent': 'WA-Bot'
      },
      body: JSON.stringify({
        description: 'WA Bot Session',
        files: { 'session.json': { content: JSON.stringify(files) } }
      })
    });
    const gist = await res.json();
    if (gist.id) {
      console.log('SESSION TERSIMPAN! GIST_ID=' + gist.id);
      console.log('Tambahkan GIST_ID=' + gist.id + ' di Railway Variables');
    } else {
      console.log('Gagal simpan: ' + JSON.stringify(gist).substring(0, 200));
    }
  } catch (e) {
    console.log('Error save: ' + e.message);
  }
}

async function restoreSession() {
  const gistId = process.env.GIST_ID;
  if (!gistId) { console.log('GIST_ID belum diset, scan QR baru'); return; }
  try {
    console.log('Restore dari Gist ' + gistId + '...');
    const res = await fetch('https://api.github.com/gists/' + gistId, {
      headers: { 'Authorization': '***' + GITHUB_TOKEN, 'User-Agent': 'WA-Bot' }
    });
    const gist = await res.json();
    const file = gist.files && gist.files['session.json'];
    if (!file) { console.log('Session tidak ada'); return; }
    const data = JSON.parse(file.content);
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    for (const [fp, content] of Object.entries(data)) {
      const full = path.join(SESSION_DIR, fp);
      const dir = path.dirname(full);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(full, Buffer.from(content, 'base64'));
    }
    console.log('Session di-restore!');
  } catch (e) {
    console.log('Gagal restore: ' + e.message);
  }
}

// ============================================
//  WHATSAPP CLIENT
// ============================================

restoreSession();

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
  }
});

client.on('qr', (qr) => {
  const url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qr);
  console.log('SCAN QR: ' + url);
});

client.on('ready', async () => {
  console.log('BOT SIAP!');
  console.log('Groq keys: ' + GROQ_KEYS.length);
  if (GITHUB_TOKEN) await saveSession();
});

client.on('authenticated', () => console.log('Auth OK!'));
client.on('auth_failure', (m) => console.log('Auth fail: ' + m));
client.on('disconnected', (r) => console.log('Disconnected: ' + r));

// ============================================
//  HANDLE PESAN
// ============================================

const busy = {};

client.on('message', async (message) => {
  try {
    const body = (message.body || '').trim();
    if (!body || message.from === 'status@broadcast') return;
    if (message.from.endsWith('@g.us') && !(message.mentionedIds && message.mentionedIds.length)) return;
    if (busy[message.from]) { await message.reply('Sabar ya, masih proses...'); return; }

    busy[message.from] = true;
    console.log('Pesan: ' + body.substring(0, 80));

    try {
      const chat = await message.getChat();
      await chat.sendStateTyping();
      const reply = await askAI(body);
      await message.reply(reply);
      console.log('Reply OK');
    } catch (e) {
      console.log('Error: ' + e.message);
      try { await message.reply('Error: ' + e.message); } catch (_) {}
    } finally {
      delete busy[message.from];
    }
  } catch (e) {}
});

// Memory limit
setInterval(() => {
  const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (global.gc) global.gc();
  if (mb > 300) { console.log('Memory ' + mb + 'MB, restart'); process.exit(1); }
}, 60000);

console.log('Starting WhatsApp bot...');
console.log('Groq keys: ' + GROQ_KEYS.length);
client.initialize();

process.on('SIGTERM', async () => { await client.destroy(); process.exit(0); });
process.on('uncaughtException', (e) => console.log('Err: ' + e.message));
process.on('unhandledRejection', (e) => console.log('Unhandled: ' + String(e)));
