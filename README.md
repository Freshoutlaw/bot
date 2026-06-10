# 💬 WhatsApp Waitlist Bot

A smart **WhatsApp customer service waitlist bot** — no Meta API token required. Uses **whatsapp-web.js** (QR code / phone number linking), powered by **Groq AI (LLaMA 3)**, with a live admin dashboard.

---

## ✨ Features

- 📱 **Link via QR code or phone number** — just scan with WhatsApp
- 🤖 **Groq AI responses** — intelligent fallback for unrecognized messages
- 📋 **Full waitlist management** — join, check position, cancel
- 🖥️ **Live admin dashboard** — web UI to manage the queue and view live chat spaces
- 💬 **Admin reply support** — send responses back to customers from the dashboard
- 🔐 **Secure** — rate limiting, input sanitization, admin auth
- 💾 **Persistent storage** — waitlist survives restarts (JSON file)
- 🚀 **Deployable to Vercel**

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/whatsapp-waitlist-bot
cd whatsapp-waitlist-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
GROQ_API_KEY=your_groq_api_key_here      # https://console.groq.com (free)
ADMIN_SECRET=your_strong_secret_here
```

### 3. Run the Bot

```bash
npm start
```

### 4. Link Your WhatsApp

Open **http://localhost:3000** in your browser. A QR code will appear.

**On your phone:**
> WhatsApp → Settings → Linked Devices → Link a Device → Scan QR

Your WhatsApp is now connected! The bot will respond to messages automatically.

---

## 📱 Customer Commands

| Command | Description |
|---------|-------------|
| `JOIN` | Join the waitlist |
| `STATUS` | Check your position |
| `CANCEL` | Leave the waitlist |
| `STATS` | View queue statistics |
| `HELP` | Show all options |

Customers can also type natural language — Groq AI handles it intelligently.

---

## 🖥️ Admin Dashboard

Visit **http://localhost:3000** to:

- See live queue stats
- View all waitlist entries
- View active customer chat spaces
- Send replies to customers directly from the dashboard
- Serve the next customer
- Mark customers as done
- Scan QR code to connect WhatsApp

Protected by `ADMIN_SECRET` header (`x-admin-key`).

---

## 🚀 Deploy to Vercel

> **Note:** whatsapp-web.js requires a persistent server (Puppeteer/Chromium). Vercel serverless functions have a 10s timeout — for production, use **Railway**, **Render**, or **a VPS**. Vercel works best for the dashboard only.

### Recommended: Railway (Free tier available)

1. Push to GitHub (see below)
2. Go to [railway.app](https://railway.app)
3. New Project → Deploy from GitHub repo
4. Add environment variables: `GROQ_API_KEY`, `ADMIN_SECRET`
5. Done! Railway gives you a public URL

### Vercel (Dashboard only)

```bash
npm i -g vercel
vercel
```

Add secrets in Vercel dashboard under **Settings → Environment Variables**.

---

## 📤 Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: WhatsApp Waitlist Bot"
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-waitlist-bot.git
git push -u origin main
```

---

## 🔐 Security Features

- ✅ Rate limiting (20 messages/minute per user)
- ✅ Input sanitization (XSS prevention)
- ✅ Admin route protection via secret key
- ✅ Helmet.js HTTP security headers
- ✅ CORS configuration
- ✅ Request size limits
- ✅ No sensitive data logged

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| WhatsApp | whatsapp-web.js (no Meta API needed) |
| AI | Groq SDK — LLaMA 3 8B |
| Web server | Express.js |
| Security | Helmet, express-rate-limit |
| Logging | Winston |
| Storage | JSON file (persistent) |

---

## 📁 Project Structure

```
whatsapp-waitlist-bot/
├── src/
│   ├── index.js          # Main entry — WhatsApp client
│   ├── web.js            # Express dashboard + API
│   ├── messageHandler.js # Conversation flow logic
│   ├── waitlist.js       # Waitlist CRUD operations
│   ├── groqAI.js         # Groq AI integration
│   └── logger.js         # Winston logger
├── data/                 # Waitlist data (auto-created)
├── logs/                 # Log files (auto-created)
├── .env.example          # Environment template
├── vercel.json           # Vercel config
└── README.md
```

---

## 🆓 Free Resources

- **Groq API Key** (free): https://console.groq.com
- **Railway hosting** (free tier): https://railway.app
- **GitHub** (free): https://github.com

---

## 📄 License

MIT — free to use and modify.