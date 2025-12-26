import fetch from "node-fetch";
import { Client, Databases } from "node-appwrite";

/**
 * Main Appwrite Function Handler
 * @returns {Object} Response object
 */
export default async ({ req, res, log, error }) => {
  try {
    log("🚀 Starting Iran Internet Report Generation...");

    /* ---------------- 1. Initialize Appwrite Client ---------------- */
    const client = new Client()
      .setEndpoint(
        process.env.APPWRITE_ENDPOINT ?? "https://cloud.appwrite.io/v1",
      )
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);

    /* ---------------- 2. Collect Data with Perplexity ---------------- */
    log("📊 Fetching data from Perplexity AI...");
    const pplxResponse = await fetch(
      "https://api.perplexity.ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content:
                "You are a data collector specializing in internet infrastructure and statistics.",
            },
            {
              role: "user",
              content:
                "Collect the latest factual data about internet situation in Iran with statistics, sources, and recent developments.",
            },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      },
    );

    if (!pplxResponse.ok) {
      throw new Error(`Perplexity API Error: ${pplxResponse.status}`);
    }

    const pplxData = await pplxResponse.json();
    const rawData = pplxData.choices[0].message.content;
    log("✅ Data collected successfully");

    /* ---------------- 3. Analyze with OpenAI (ChatGPT) ---------------- */
    log("🤖 Analyzing data with ChatGPT...");

    const gptResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a professional data analyst. Create concise, actionable reports in Persian suitable for Telegram channels.",
            },
            {
              role: "user",
              content: `
تحلیل داده‌های زیر و تولید:
1️⃣ 5 نکته کلیدی (به فارسی)
2️⃣ گزارش خلاصه برای تلگرام
3️⃣ آمار و ارقام مهم

داده‌ها:
${rawData}

خروجی باید کاملاً فارسی و مناسب کانال تلگرام باشد.
`,
            },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      },
    );

    if (!gptResponse.ok) {
      throw new Error(`OpenAI API Error: ${gptResponse.status}`);
    }

    const gptData = await gptResponse.json();
    const analysis = gptData.choices[0].message.content;
    log("✅ Analysis completed");

    /* ---------------- 4. GENERATE FINAL REPORT ---------------- */
    const persianDate = new Date().toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const finalReport = `
📊 گزارش هوشمند: وضعیت اینترنت ایران

${analysis}

━━━━━━━━━━━━━━━━━
🕒 ${persianDate}
━━━━━━━━━━━━━━━━━
`;

    /* ---------------- 5. SAVE TO DATABASE ---------------- */
    log("💾 Saving to database...");

    const document = await databases.createDocument(
      process.env.APPWRITE_DB_ID,
      process.env.APPWRITE_COLLECTION_ID,
      "unique()",
      {
        topic: "Internet in Iran",
        raw_data: rawData.substring(0, 10000), // Limit length
        analysis: analysis.substring(0, 5000),
        final_report: finalReport,
        created_at: new Date().toISOString(),
        status: "published",
      },
    );

    log(`✅ Document created: ${document.$id}`);

    /* ---------------- 6. SEND TO TELEGRAM ---------------- */
    log("📤 Sending to Telegram...");

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHANNEL_ID,
          text: finalReport,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      },
    );

    if (!telegramResponse.ok) {
      const telegramError = await telegramResponse.text();
      throw new Error(`Telegram API Error: ${telegramError}`);
    }

    log("✅ Report sent to Telegram successfully");

    /* ---------------- 7. Return Success Response ---------------- */
    return res.json({
      success: true,
      message: "✅ گزارش با موفقیت تولید و ارسال شد",
      document_id: document.$id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    error(`❌ Error: ${err.message}`);
    error(err.stack);

    return res.json(
      {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
};
