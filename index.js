const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');

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

async function callGroq(systemPrompt, userMessage, retries = GROQ_KEYS.length) {
  for (let i = 0; i < retries; i++) {
    const key = getNextKey();
    if (!key) throw new Error('Tidak ada API key Groq yang tersedia');

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
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

      if (res.status === 429) {
        console.log(`⚠️ Rate limit di key ${i + 1}, coba key berikutnya...`);
        continue;
      }

      if (!res.ok) {
        const err = await res.text();
        console.error(`Groq error (${res.status}):`, err);
        continue;
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (err) {
      console.error(`Groq call error:`, err.message);
      continue;
    }
  }
  throw new Error('Semua Groq API key gagal');
}

// ============================================
//  SYSTEM PROMPT UNTUK AI
// ============================================

const SYSTEM_PROMPT = `Kamu adalah bot WhatsApp yang pintar dan santai. Tugasmu:

1. **DETEKSI OTOMATIS** apakah user meminta:
   - Terjemahan biasa (dari bahasa apapun ke bahasa apapun)
   - Saran bahasa gaul/slang Inggris
   - Penjelasan singkatan internet slang (cz, rn, ngl, tbh, fr, ong, dll)

2. **JIKA user minta terjemahan:**
   - Terjemahkan ke bahasa yang diminta (default: Inggris)
   - Jika ada slang/bahasa gaul, jelaskan juga artinya
   - Format: kasih terjemahan + penjelasan slang jika ada

3. **JIKA user minta saran bahasa gaul / slang:**
   - Kasih padanan bahasa gaul Inggris dari kata/frasa Indonesia yang dikirim
   - Sertakan arti, contoh kalimat, dan konteks penggunaan
   - Bisa kasih beberapa alternatif

4. **JIKA user kirim singkatan Inggris (cz, rn, ngl, tbh, dll):**
   - Jelaskan kepanjangan dan artinya
   - Kasih contoh penggunaan

5. **JIKA user mengobrol biasa / sapaan:**
   - Balas dengan santai dan ramai, pakai bahasa sehari-hari
   - Bisa pakai emoji

6. **JIKA tidak jelas:**
   - Tanya balik dengan sopan

Aturan:
- Selalu gunakan bahasa yang santai dan gaul (tapi sopan)
- Jangan terlalu panjang, cukup padat dan jelas
- Gunakan emoji secukupnya
- Jika pesan mengandung campuran Indonesia-Inggris, tangani dengan bijak
- Untuk terjemahan, selalu tampilkan dalam format yang rapi`;

// ============================================
//  WHATSAPP CLIENT
// ============================================

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './session_data'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--memory-pressure-off',
      '--js-flags=--max-old-space-size=256'
    ],
  },
});

client.on('qr', (qr) => {
  console.log('\n========================================');
  console.log('  SCAN QR CODE INI DENGAN WHATSAPP');
  console.log('========================================\n');
  qrcode.generateTerminal(qr, { small: true });
  console.log('\nBuka WhatsApp → Linked Devices → Link a Device\n');
});

client.on('ready', () => {
  console.log('✅ Bot WhatsApp siap!');
  console.log(`🔑 Groq API keys: ${GROQ_KEYS.length} tersedia`);
});

client.on('authenticated', () => console.log('🔐 Autentikasi berhasil!'));
client.on('auth_failure', (msg) => console.error('❌ Autentikasi gagal:', msg));
client.on('disconnected', (reason) => console.log('🔌 Terputus:', reason));

// ============================================
//  HANDLER PESAN
// ============================================

// Anti-spam: track processing per user
const processing = new Set();

client.on('message', async (message) => {
  try {
    const body = message.body.trim();
    if (!body) return;

    // Skip status broadcast & grup (kecuali di-mention)
    if (message.from === 'status@broadcast') return;
    if (message.from.endsWith('@g.us')) {
      // Di grup: hanya respon jika di-mention
      const mentionedMe = message.mentionedIds?.includes(client.info?.wid?._serialized);
      if (!mentionedMe) return;
      // Hapus mention dari pesan
      const cleanBody = body.replace(/@\d+/g, '').trim();
      if (!cleanBody) return;
      await handleAI(message, cleanBody);
      return;
    }

    await handleAI(message, body);

  } catch (err) {
    console.error('Error:', err.message);
  }
});

async function handleAI(message, body) {
  // Anti-spam
  const userKey = message.from;
  if (processing.has(userKey)) {
    await message.reply('⏳ Sabar ya, masih proses pesan sebelumnya...');
    return;
  }

  processing.add(userKey);

  try {
    // Kirim typing indicator
    const chat = await message.getChat();
    await chat.sendStateTyping();

    // Panggil Groq AI
    const response = await callGroq(SYSTEM_PROMPT, body);

    if (response) {
      await message.reply(response);
    } else {
      await message.reply('😵 Aku lagi bingung nih, coba ulangi ya...');
    }
  } catch (err) {
    console.error('AI Error:', err.message);
    await message.reply('⚠️ Lagi ada gangguan, coba beberapa saat lagi ya~');
  } finally {
    processing.delete(userKey);
  }
}

// ============================================
//  GRACEFUL SHUTDOWN & MEMORY MANAGEMENT
// ============================================

// ============================================
//  MEMORY LIMITER - Maksimal 300MB
// ============================================
const MEMORY_LIMIT_MB = 300;

function checkMemory() {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const rssMB = Math.round(used.rss / 1024 / 1024);

  if (heapUsedMB > MEMORY_LIMIT_MB * 0.8) {
    console.log(`⚠️ Memory tinggi: heap=${heapUsedMB}MB, rss=${rssMB}MB — GC dipaksa`);
    if (global.gc) global.gc();
  }

  if (rssMB > MEMORY_LIMIT_MB) {
    console.error(`❌ Memory limit terlampaui (${rssMB}MB > ${MEMORY_LIMIT_MB}MB) — restart...`);
    process.exit(1); // Railway auto-restart
  }
}

// Cek memory setiap 30 detik
setInterval(checkMemory, 30000);

// Bersihkan memory secara berkala
setInterval(() => {
  if (global.gc) global.gc();
}, 60000);

process.on('SIGINT', async () => {
  console.log('\n🛑 Mematikan bot...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Mematikan bot...');
  await client.destroy();
  process.exit(0);
});

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// ============================================
//  START
// ============================================

console.log('🚀 Memulai bot WhatsApp (Groq AI)...');
console.log('📱 Scan QR code untuk login\n');

client.initialize();
