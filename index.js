const { Client, LocalAuth } = require('whatsapp-web.js');
const fetch = require('node-fetch');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// ============================================
//  GROQ AI - ROTASI API KEY
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
  if (GROQ_KEYS.length === 0) return 'API key belum dikonfigurasi. Tambahkan GROQ_KEY_1 di Railway Variables.';

  const systemPrompt = `Kamu adalah bot WhatsApp yang pintar dan santai. Tugasmu:
1. DETEKSI OTOMATIS apakah user minta terjemahan, saran slang, atau penjelasan singkatan
2. Terjemahkan dari bahasa apapun ke bahasa apapun (default: Inggris)
3. Kasih padanan bahasa gaul Inggris dari kata Indonesia + arti + contoh
4. Jelaskan singkatan internet slang (cz, rn, ngl, tbh, fr, ong, dll)
5. Kalau user ngobrol biasa, balas santai dan ramah
Aturan: Santai tapi sopan, pakai emoji, jangan terlalu panjang.`;

  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = getNextKey();
    console.log('Groq: Coba key ' + (i + 1) + '/' + GROQ_KEYS.length);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });
      console.log('Groq key ' + (i + 1) + ': Status ' + response.status);
      if (response.status === 429) { console.log('Rate limit, coba berikutnya...'); continue; }
      if (response.status === 401) { console.log('Key tidak valid!'); continue; }
      const text = await response.text();
      if (response.status !== 200) { console.log('Gagal: ' + text.substring(0, 100)); continue; }
      const json = JSON.parse(text);
      const result = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (result) { console.log('Groq key ' + (i + 1) + ': Berhasil!'); return result; }
    } catch (err) {
      console.log('Groq key ' + (i + 1) + ': Error - ' + String(err));
    }
  }
  return 'Maaf, semua API key sedang bermasalah. Coba lagi nanti ya~';
}

// ============================================
//  RESTORE SESSION DARI ENV VAR
// ============================================

const SESSION_DIR = path.join(__dirname, 'session_data');
const SESSION_ENV = process.env.WA_SESSION || '';

// Restore session dari environment variable jika ada
if (SESSION_ENV && !fs.existsSync(path.join(SESSION_DIR, 'Default'))) {
  try {
    console.log('Restore session dari environment variable...');
    const sessionData = JSON.parse(Buffer.from(SESSION_ENV, 'base64').toString());
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    // Tulis file-file session
    for (const [filePath, content] of Object.entries(sessionData)) {
      const fullPath = path.join(SESSION_DIR, filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, Buffer.from(content, 'base64'));
    }
    console.log('Session berhasil di-restore!');
  } catch (err) {
    console.log('Gagal restore session: ' + String(err));
  }
}

// ============================================
//  WHATSAPP CLIENT
// ============================================

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  },
});

client.on('qr', async (qr) => {
  console.log('========================================');
  console.log('  SCAN QR CODE INI DENGAN WHATSAPP');
  console.log('========================================');
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qr);
  console.log('SCAN DI SINI: ' + qrUrl);
});

client.on('ready', async () => {
  console.log('Bot WhatsApp siap!');
  console.log('Groq API keys: ' + GROQ_KEYS.length + ' tersedia');

  // Export session ke base64 dan cetak ke logs
  try {
    // Cari folder session
    const sessionDirs = [];
    const findSession = (dir) => {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          sessionDirs.push(full);
          findSession(full);
        }
      }
    };
    findSession(SESSION_DIR);

    console.log('Session dirs ditemukan: ' + sessionDirs.length);

    // Export semua file
    const sessionFiles = {};
    const exportFiles = (dir, prefix) => {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        const rel = prefix ? prefix + '/' + item : item;
        if (fs.statSync(full).isDirectory()) {
          exportFiles(full, rel);
        } else {
          try {
            sessionFiles[rel] = fs.readFileSync(full).toString('base64');
          } catch (e) {}
        }
      }
    };
    exportFiles(SESSION_DIR, '');

    const fileCount = Object.keys(sessionFiles).length;
    console.log('File session: ' + fileCount);

    if (fileCount > 0) {
      const sessionBase64 = Buffer.from(JSON.stringify(sessionFiles)).toString('base64');
      console.log('');
      console.log('========================================');
      console.log('  SESSION DATA - COPY INI KE RAILWAY');
      console.log('========================================');
      console.log('');
      console.log('ENV VAR NAME: WA_SESSION');
      console.log('ENV VAR VALUE:');
      console.log(sessionBase64);
      console.log('');
      console.log('========================================');
    } else {
      console.log('Tidak ada file session untuk di-export');
    }
  } catch (err) {
    console.log('Gagal export session: ' + String(err));
  }
});

client.on('authenticated', () => console.log('Autentikasi berhasil!'));
client.on('auth_failure', (msg) => console.log('Autentikasi gagal: ' + msg));
client.on('disconnected', (reason) => console.log('Terputus: ' + reason));

// ============================================
//  HANDLE PESAN
// ============================================

const busy = {};

client.on('message', async (message) => {
  try {
    const body = message.body ? message.body.trim() : '';
    if (!body) return;
    if (message.from === 'status@broadcast') return;

    if (message.from.endsWith('@g.us')) {
      const isMentioned = message.mentionedIds && message.mentionedIds.length > 0;
      if (!isMentioned) return;
    }

    if (busy[message.from]) {
      await message.reply('Sabar ya, masih proses pesan sebelumnya...');
      return;
    }

    busy[message.from] = true;

    try {
      const chat = await message.getChat();
      await chat.sendStateTyping();
      console.log('Pesan masuk: ' + body.substring(0, 50));
      const reply = await askAI(body);
      await message.reply(reply);
      console.log('Reply terkirim');
    } catch (err) {
      console.log('Error: ' + String(err));
      await message.reply('Error: ' + String(err));
    } finally {
      delete busy[message.from];
    }
  } catch (err) {
    console.log('Error luar: ' + String(err));
  }
});

// ============================================
//  MEMORY MANAGEMENT
// ============================================

setInterval(() => {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  if (global.gc) global.gc();
  if (heapMB > 300) {
    console.log('Memory terlalu tinggi (' + heapMB + 'MB), restart...');
    process.exit(1);
  }
}, 60000);

// ============================================
//  START
// ============================================

console.log('Memulai bot WhatsApp...');
console.log('API keys: ' + GROQ_KEYS.length);
if (GROQ_KEYS.length === 0) console.error('TIDAK ADA GROQ_KEY! Tambahkan di Railway Variables.');

client.initialize();

process.on('SIGINT', async () => { await client.destroy(); process.exit(0); });
process.on('SIGTERM', async () => { await client.destroy(); process.exit(0); });
process.on('uncaughtException', (err) => console.log('Uncaught: ' + String(err)));
process.on('unhandledRejection', (err) => console.log('Unhandled: ' + String(err)));
