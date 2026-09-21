# 🎮 Razq Store

منصة ألعاب حصرية لقروبات الديسكورد — تسجيل دخول عبر ديسكورد، مطابقة لاعبين عشوائية، 9 ألعاب جماعية، لوحات متصدرين، وتصميم رمادي أنيق.

## ⚠️ ملاحظة مهمة عن الاستضافة

هذا المشروع **سيرفر حقيقي** (Node.js) فيه تسجيل دخول وربط مع بوت ديسكورد ومطابقة لاعبين مباشرة (Live). **GitHub Pages يستضيف صفحات ثابتة فقط ولا يقدر يشغل سيرفر خلفي**. لهذا:

- كود الموقع كامل يترفع على GitHub (مستودعك الخاص) بدون مشاكل.
- تشغيل الموقع فعليًا (عشان يشتغل تسجيل الدخول والألعاب) لازم يكون على استضافة تشغّل Node.js، مثل [Render](https://render.com) (فيه خطة مجانية) أو Railway أو VPS خاص فيك.
- المشروع **ما يحتاج أي مكتبات خارجية** (zero dependencies) — فقط Node.js الأساسي، فهذا يخلي رفعه وتشغيله أسهل وأسرع على أي استضافة.

## 🚀 خطوات التشغيل

### 1. تجهيز تطبيق ديسكورد

1. روح [Discord Developer Portal](https://discord.com/developers/applications) وسوي تطبيق جديد.
2. من تبويب **OAuth2** خذ `Client ID` و `Client Secret`.
3. في نفس التبويب أضف Redirect URL: `https://your-domain.com/auth/discord/callback` (أو `http://localhost:3000/auth/discord/callback` للتجربة المحلية).
4. من تبويب **Bot** أنشئ بوت وخذ الـ `Token`، وفعّل صلاحية `SERVER MEMBERS INTENT`.
5. ادعُ البوت لسيرفرك (من تبويب OAuth2 → URL Generator → اختر `bot` مع صلاحية `View Channels`).
6. فعّل Developer Mode في ديسكورد (الإعدادات → متقدم) عشان تقدر تنسخ **Server ID** (اضغط يمين على السيرفر → Copy Server ID).

### 2. إعداد المتغيرات

انسخ `.env.example` إلى `.env` وعبّي القيم:

```bash
cp .env.example .env
```

```
BASE_URL=http://localhost:3000
PORT=3000
SESSION_SECRET=نص-عشوائي-طويل-غيّره
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
```

### 3. تشغيل محلي

```bash
node src/server.js
```

افتح `http://localhost:3000`.

### 4. رفع المشروع على GitHub

```bash
git init
git add .
git commit -m "Razq Store - إطلاق أولي"
git branch -M main
git remote add origin https://github.com/USERNAME/razq-store.git
git push -u origin main
```

### 5. النشر (Deploy) على Render (مجاني)

1. سوّي حساب على [render.com](https://render.com) واربطه بمستودع GitHub.
2. **New +** → **Web Service** → اختر المستودع.
3. Build Command: (اتركه فاضي)
4. Start Command: `node src/server.js`
5. أضف متغيرات البيئة (نفس محتوى `.env`) من تبويب Environment، وغيّر `BASE_URL` و `DISCORD_REDIRECT_URI` لرابط Render النهائي، وحدّثهم بنفس الرابط في Discord Developer Portal.
6. اضغط Deploy.

## 🕹️ الألعاب المتوفرة

إكس أو، نرد، حجرة ورقة مقص، كراسي، روليت، بومب، غميضة، مافيا، ريبلكا.

كل لعبة صفحتها الخاصة، فيها زر "طريقة اللعب"، لوح متصدرين، مطابقة عشوائية، وشاشة "جاهز/غير جاهز" قبل البداية.

## 🎨 تخصيص اللوقو

بعد تسجيل الدخول تقدر تضغط "تغيير لوقو الموقع" بالصفحة الرئيسية وترفع صورة — تنحفظ تلقائيًا وتظهر لكل الزوار.

## 🗂️ هيكلة المشروع

```
src/
  server.js        نقطة الدخول - سيرفر HTTP + كل المسارات (routes)
  db/               تخزين بسيط بصيغة JSON (بدون قاعدة بيانات خارجية)
  discord/          تسجيل الدخول عبر ديسكورد وجلب النك نيم/الصورة من البوت
  games/            منطق كل لعبة (engines.js) + بيانات الألعاب (index.js)
  matchmaking.js    نظام قائمة الانتظار والغرف والمطابقة العشوائية
public/
  index.html        الصفحة الرئيسية
  games/*.html       صفحة كل لعبة
  js/                الواجهة (شل مشترك + ملف لكل لعبة)
  css/style.css      التصميم الرمادي الأنيق
```

## 📝 ملاحظات

- البيانات (المستخدمين، النتائج، لوحة المتصدرين) تُحفظ بملفات JSON داخل مجلد `data/` تلقائيًا.
- الاتصال الحي بين المتصفح والسيرفر يعمل عن طريق "Polling" (تحديث كل أقل من ثانية) بدل WebSockets، عشان المشروع يشتغل على أي استضافة بدون أي مكتبات خارجية.
