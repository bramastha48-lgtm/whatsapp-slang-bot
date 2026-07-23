# 🤖 WhatsApp Slang & Translator Bot (Groq AI)

Bot WhatsApp dengan AI yang bisa terjemahkan multi-bahasa dan kasih saran bahasa gaul — otomatis deteksi intent, tanpa command ribet.

## ✨ Fitur

- 🌐 **Multi-bahasa** — terjemahkan dari/ke bahasa apapun (34+ bahasa)
- 🇬🇧 **Slang Indonesia → Inggris** — kasih padanan bahasa gaul + contoh
- 🔤 **Internet Slang** — kenali singkatan: cz, rn, ngl, tbh, fr, ong, dll
- 🤖 **Groq AI (Llama 3.1)** — respons cerdas & natural
- 🔑 **5 API Key Rotasi** — otomatis switch kalau limit habis
- 🔓 **Akses Terbuka** — siapa saja bisa pakai

## 📱 Cara Pakai

Langsung chat aja, bot otomatis paham mau kamu apa:

```
Kamu: translate "gue lagi mager banget" ke jepang
Bot: 今日はやる気が出ない
     (Kyou wa yaruki ga denai)
     💡 "mager" = malas gerak

Kamu: apa bahasa gaulnya "bucin"?
Bot: 🇬🇧 Slang equivalents:
     • simp — orang yang terlalu nurut sama crush/pacar
     • down bad — terlalu pengen/kepepet
     • whipped — "dikendalikan" sama pasangan

Kamu: ngl ts is crazy fr
Bot: 🔤 Internet slang:
     • ngl = not gonna lie (jujur aja)
     • ts = this shit (ini)
     • fr = for real (seriusan)
     Full: "Jujur aja ini gila, seriusan"

Kamu: haloo
Bot: Haloo! 👋 Ada yang bisa dibantu?
```

## 🚀 Deploy ke Railway

### Step 1: Fork/Upload ke GitHub

Upload semua file ke repo GitHub kamu.

### Step 2: Deploy di Railway

1. Buka [railway.app](https://railway.app) → Login pakai GitHub
2. **New Project** → **Deploy from GitHub Repo**
3. Pilih repo kamu
4. Tambahkan **Environment Variables**:

```
GROQ_KEY_1 = gsk_xxx...
GROQ_KEY_2 = gsk_xxx...
GROQ_KEY_3 = gsk_xxx...
GROQ_KEY_4 = gsk_xxx...
GROQ_KEY_5 = gsk_xxx...
```

5. Railway auto-deploy

### Step 3: Login WhatsApp

1. Buka tab **Deployments** → klik deployment terbaru
2. Buka tab **Logs**
3. Tunggu QR code muncul
4. Buka WhatsApp → **Linked Devices** → **Link a Device**
5. Scan QR code

### Step 4: Limit Memory (PENTING!)

Di Railway:
1. Klik service → **Settings**
2. Di bagian **Service Limits**:
   - Set **Memory** ke `512 MB`
   - Set **vCPU** ke `1`

---

## 🔑 Groq API Key

Ambil gratis di: https://console.groq.com

1. Sign up / Login
2. Menu **API Keys** → **Create API Key**
3. Copy key (format: `gsk_xxxxx`)
4. Tambahkan di Railway Environment Variables

**Kenapa 5 key?** Groq ada rate limit gratis. Dengan 5 key, bot otomatis switch ke key berikutnya kalau limit habis — jadi bot tetap jalan 24/7.

---

## 🛠️ Tech Stack

- **WhatsApp**: whatsapp-web.js
- **AI**: Groq (Llama 3.1 8B Instant) — gratis & cepat
- **Runtime**: Node.js 20
- **Hosting**: Railway (free tier)

## ⚠️ Catatan

- whatsapp-web.js adalah library tidak resmi
- HP harus online untuk tetap login
- Session tersimpan otomatis di container
- Bot auto-restart kalau crash
