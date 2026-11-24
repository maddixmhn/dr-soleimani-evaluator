# راهنمای فارسی اجرای ارزیاب

ارزیاب دکتر سلیمانی دفتر رخداد فاران را در مرورگر تحلیل می‌کند. برای آزمایش رابط به حساب دانشگاه یا API خارجی نیاز نیست.

## اجرای مستقل

Docker و Compose را آماده کن و این دستورات را اجرا کن:

```bash
git clone https://github.com/maddixmhn/dr-soleimani-evaluator.git
cd dr-soleimani-evaluator
docker compose up -d --build --wait
```

سایت روی [localhost:18001](http://localhost:18001) در دسترس است. برای ورود به داشبورد نمونه از `admin` / `admin` استفاده کن. در بخش «تحلیل مأموریت‌های نیمسال» گزارش نمونه را بررسی کن. برای تحلیل ورودی خودت، یک فایل رویداد JSON انتخاب کن. گزارش کوتاه یا دادهٔ جدول را می‌توان از همان داشبورد دریافت کرد.

برای مشاهدهٔ وضعیت از `docker compose ps` و برای توقف از `docker compose stop` استفاده کن. اگر پورتی اشغال باشد، متغیر محیطی `FARAN_EVAL_PORT` را پیش از اجرا تنظیم کن.

## اجرای هر دو پروژه

برای راه‌اندازی دانشگاه، ارزیاب، Moodle، Paperclip، n8n، worker و پایگاه‌های داده از اسکریپت مخزن فاران استفاده کن. اگر بستهٔ کامل بالا است، ارزیاب همان بسته از قبل در آدرس پیش‌فرض اجرا می‌شود. [راهنمای اجرای کامل فاران](https://github.com/maddixmhn/faran/blob/master/docs/QUICKSTART-FA.md)

- [دانلود مقالهٔ ارزیابی کارایی](https://dr-soleimani-evaluator.vercel.app/docs/evaluation-article.pdf)
- [خواندن مقاله در وب](https://dr-soleimani-evaluator.vercel.app/docs/article.html)
- [سایت عمومی ارزیاب](https://dr-soleimani-evaluator.vercel.app/)
