const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

// ============================================
//  CONFIG
// ============================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8422389122:AAGohYW4QLme2qmw3ISkMGNTdwUfuMHYSrU';

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

  const sys = `Kamu adalah bot Telegram yang pintar dan santai. Tugasmu:

1. DETEKSI OTOMATIS apakah user minta terjemahan, saran slang, atau penjelasan singkatan.
2. Terjemahkan dari bahasa apapun ke bahasa apapun (default Inggris).
3. Kasih padanan bahasa gaul Inggris dari kata Indonesia.
4. Jelaskan singkatan internet slang (cz, rn, ngl, tbh, fr, ong, dll).
5. Kalau user ngobrol biasa, balas santai dan ramah.

Aturan penting:
- Terjemahan harus berupa KALIMAT UTUH yang natural dan mengalir, BUKAN terjemahan kata per kata.
- Jangan pecah terjemahan jadi "kata1 -> arti1, kata2 -> arti2". Langsung kasih terjemahan utuh.
- Contoh benar: Input "kenapa kamu tidak chat aku?" -> Output: "Why haven't you messaged me?" (satu kalimat utuh)
- Contoh salah: "Kenapa -> Why, kamu -> you, tidak -> not" (JANGAN seperti ini)
- Santai, pakai emoji, jangan terlalu panjang, gunakan format Telegram (*bold*, _italic_).`;

  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = nextKey();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
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
        console.log('Groq key ' + (i + 1) + ': status ' + res.status);
        continue;
      }

      const data = JSON.parse(await res.text());
      const result = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (result) return result;
    } catch (e) {
      console.log('Groq error: ' + e.message);
    }
  }
  return '⚠️ API sedang bermasalah. Coba lagi nanti ya~';
}

// ============================================
//  TELEGRAM BOT
// ============================================

const bot = new Telegraf(TELEGRAM_TOKEN);

// /start
bot.start((ctx) => {
  ctx.reply(
    '👋 *Halo! Aku Bot Slang & Translator!*\n\n' +
    'Ketik apa saja, aku otomatis deteksi:\n\n' +
    '🌐 *Terjemahan:* `translate gue mager ke jepang`\n' +
    '🇬🇧 *Slang:* `apa bahasa gaulnya bucin?`\n' +
    '🔤 *Singkatan:* `apa artinya ngl?`\n' +
    '💬 *Chat biasa:* `halo`\n\n' +
    'Coba ketik sesuatu! 👇',
    { parse_mode: 'Markdown' }
  );
});

// /help
bot.help((ctx) => {
  ctx.reply(
    '📖 *Cara Pakai Bot:*\n\n' +
    '🌐 *Terjemahan:*\n' +
    '  `translate gue mager ke jepang`\n' +
    '  `terjemahkan ini ke korean: apa kabar?`\n\n' +
    '🇬🇧 *Saran Slang:*\n' +
    '  `apa slangnya bucin?`\n' +
    '  `bahasa gaulnya mager dalam bahasa inggris`\n\n' +
    '🔤 *Internet Slang:*\n' +
    '  `apa artinya cz?`\ng  `ngl itu apa?`\n' +
    '  `penjelasan singkatan: tbh, fr, ong`\n\n' +
    '💬 *Chat biasa:*\n' +
    '  Ketik apa saja, aku balas santai!\n\n' +
    '_Bot otomatis deteksi mau kamu apa_ 😎',
    { parse_mode: 'Markdown' }
  );
});

// Handle semua pesan teks
bot.on('text', async (ctx) => {
  const msg = ctx.message.text;
  const userId = ctx.from.id;
  console.log('[' + userId + '] ' + msg.substring(0, 80));

  // Typing indicator
  ctx.replyWithChatAction('typing');

  const reply = await askAI(msg);
  ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() => {
    // Fallback tanpa markdown kalau gagal
    ctx.reply(reply);
  });
});

// ============================================
//  MEMORY & START
// ============================================

setInterval(() => {
  const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (global.gc) global.gc();
  if (mb > 300) { console.log('Memory ' + mb + 'MB, restart'); process.exit(1); }
}, 60000);

console.log('Starting Telegram bot...');
console.log('Groq keys: ' + GROQ_KEYS.length);

bot.launch().then(() => {
  console.log('Bot Telegram siap! ✅');
}).catch(e => {
  console.log('Error launch: ' + e.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
process.on('uncaughtException', (e) => console.log('Err: ' + e.message));
process.on('unhandledRejection', (e) => console.log('Unhandled: ' + String(e)));
