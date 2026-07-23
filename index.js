const { Client, LocalAuth } = require('whatsapp-web.js');
const fetch = require('node-fetch');
const QRCode = require('qrcode');

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

// ============================================
//  GROQ API CALL
// ============================================

async function askAI(userMessage) {
  if (GROQ_KEYS.length === 0) {
    console.error('TIDAK ADA API KEY GROQ!');
    return null;
  }

  const systemPrompt = `Kamu adalah bot WhatsApp yang pintar dan santai. Tugasmu:

1. DETEKSI OTOMATIS apakah user meminta:
   - Terjemahan biasa (dari bahasa apapun ke bahasa apapun)
   - Saran bahasa gaul/slang Inggris
   - Penjelasan singkatan internet slang (cz, rn, ngl, tbh, fr, ong, dll)

2. JIKA user minta terjemahan:
   - Terjemahkan ke bahasa yang diminta (default: Inggris)
   - Jika ada slang/bahasa gaul, jelaskan juga artinya

3. JIKA user minta saran bahasa gaul / slang:
   - Kasih padanan bahasa gaul Inggris dari kata/frasa Indonesia
   - Sertakan arti dan contoh kalimat

4. JIKA user kirim singkatan Inggris (cz, rn, ngl, tbh, dll):
   - Jelaskan kepanjangan dan artinya

5. JIKA user mengobrol biasa:
   - Balas santai dan ramah, pakai bahasa sehari-hari

Aturan: Santai tapi sopan, gunakan emoji, jangan terlalu panjang.`;

  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = getNextKey();
    console.log(`Groq: Coba key ${i + 1}/${GROQ_KEYS.length}`);

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
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

      console.log(`Groq key ${i + 1}: Status ${response.status}`);

      if (response.status === 429) {
        console.log(`Groq key ${i + 1}: Rate limit, coba berikutnya...`);
        continue;
      }

      if (response.status === 401) {
        console.log(`Groq key ${i + 1}: Key tidak valid!`);
        continue;
      }

      const text = await response.text();
      console.log(`Groq key ${i + 1}: Response ${text.substring(0, 100)}`);

      if (response.status !== 200) {
        console.log(`Groq key ${i + 1}: Gagal`);
        continue;
      }

      const json = JSON.parse(text);
      const result = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (result) {
        console.log(`Groq key ${i + 1}: Berhasil!`);
        return result;
      }
    } catch (err) {
      console.log(`Groq key ${i + 1}: Error - ${String(err)}`);
    }
  }

  console.log('Semua Groq key gagal');
  return null;
}

// ============================================
//  WHATSAPP CLIENT
// ============================================

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session_data' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  },
});

client.on('qr', async (qr) => {
  console.log('========================================');
  console.log('  SCAN QR CODE INI DENGAN WHATSAPP');
  console.log('========================================');
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qr);
  console.log('SCAN DI SINI: ' + qrUrl);
  console.log('Atau buka WhatsApp -> Linked Devices -> Link a Device');
});

client.on('ready', () => {
  console.log('Bot WhatsApp siap!');
  console.log('Groq API keys: ' + GROQ_KEYS.length + ' tersedia');
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

    // Grup: hanya respon jika di-mention
    if (message.from.endsWith('@g.us')) {
      const isMentioned = message.mentionedIds && message.mentionedIds.length > 0;
      if (!isMentioned) return;
    }

    // Anti-spam
    if (busy[message.from]) {
      await message.reply('Sabar ya, masih proses pesan sebelumnya...');
      return;
    }

    busy[message.from] = true;

    try {
      // Typing indicator
      const chat = await message.getChat();
      await chat.sendStateTyping();

      // Panggil AI
      console.log('Pesan masuk: ' + body.substring(0, 50));
      const reply = await askAI(body);

      if (reply) {
        await message.reply(reply);
        console.log('Reply terkirim');
      } else {
        await message.reply('Aku lagi bingung nih, coba ulangi ya...');
      }
    } catch (err) {
      console.log('Error handle pesan: ' + String(err));
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
  console.log('Memory: ' + heapMB + 'MB');
  if (global.gc) global.gc();
  if (heapMB > 300) {
    console.log('Memory terlalu tinggi, restart...');
    process.exit(1);
  }
}, 60000);

// ============================================
//  START
// ============================================

console.log('Memulai bot WhatsApp...');
console.log('API keys ditemukan: ' + GROQ_KEYS.length);

if (GROQ_KEYS.length === 0) {
  console.error('PERINGATAN: Tidak ada GROQ_KEY di environment variables!');
  console.error('Tambahkan GROQ_KEY_1, GROQ_KEY_2, dll di Railway Variables');
}

client.initialize();

process.on('SIGINT', async () => { await client.destroy(); process.exit(0); });
process.on('SIGTERM', async () => { await client.destroy(); process.exit(0); });
process.on('uncaughtException', (err) => console.log('Uncaught: ' + String(err)));
process.on('unhandledRejection', (err) => console.log('Unhandled: ' + String(err)));
