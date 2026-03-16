const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// EXAM DATA – loaded statically (Vercel bundles these automatically)
let exams = {};

try {
  exams = {
    exit2025:   require("./exams/exit/2025.json"),
    modelaau:   require("./exams/model/aau.json"),
    modelaastu: require("./exams/model/aastu.json")
  };
  console.log("Exams loaded successfully. Keys:", Object.keys(exams));
} catch (err) {
  console.error("Failed to load exam files at startup:", err);
}

// START
bot.start(async (ctx) => {
  await ctx.reply("Welcome to Exit Exam Preparation Bot", {
    reply_markup: {
      keyboard: [["Start Exam Menu"]],
      resize_keyboard: true
    }
  });
});

// START MENU
bot.hears(/Start Exam Menu/, async (ctx) => {
  await ctx.reply("Select Exam Type", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Exit Exam", callback_data: "exit_exam" }],
        [{ text: "Model Exit Exam", callback_data: "model_exam" }]
      ]
    }
  });
});

// EXIT EXAM MENU
bot.action("exit_exam", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Select Exit Exam", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Last Year Exit Exam", callback_data: "start_exit2025" }]
      ]
    }
  });
});

// MODEL EXAM MENU
bot.action("model_exam", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Select Model Exit Exam", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "AAU Exit Exam",   callback_data: "start_modelaau" }],
        [{ text: "AASTU Exit Exam", callback_data: "start_modelaastu" }]
      ]
    }
  });
});

// START EXAM
bot.action(/start_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const examName = ctx.match[1];

  const msg = await ctx.reply("Exam Started...");
  
  // Debug: log the real message ID
  console.log("[DEBUG] Starting exam → initial message_id =", msg.message_id);

  await sendQuestion(ctx, examName, 0, msg.message_id);
});

// SEND QUESTION
async function sendQuestion(ctx, examName, index, messageId) {
  try {
    const questions = exams[examName];

    if (!questions || !Array.isArray(questions)) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        "Exam not found or data is invalid."
      );
      return;
    }

    if (index >= questions.length || index < 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        "No more questions."
      );
      return;
    }

    const q = questions[index];
    const text = `Question ${index + 1} / ${questions.length}\n\n${q.question}`;

    const keyboard = {
      inline_keyboard: q.options.map((opt, i) => [{
        text: opt,
        callback_data: `ans_${examName}_${index}_${i}_${messageId}`
      }])
    };

    // Debug: see what callback_data looks like
    console.log(
      `[DEBUG] Sending Q${index + 1} | msgId=${messageId} | sample callback: ans_${examName}_${index}_0_${messageId}`
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      text,
      { reply_markup: keyboard }
    );

  } catch (error) {
    console.error("Question send error:", error);

    // Fallback if edit fails
    await ctx.reply(
      "Failed to update the question. Please select an option again or restart."
    );
  }
}

// HANDLE ANSWER
bot.action(/ans_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const parts = ctx.match[1].split("_");
    if (parts.length !== 4) {
      console.error("[ERROR] Invalid callback_data parts:", parts);
      await ctx.answerCbQuery("Invalid question data.", { show_alert: true });
      return;
    }

    const [examName, indexStr, answerStr, messageIdStr] = parts;

    const index     = parseInt(indexStr, 10);
    const answer    = parseInt(answerStr, 10);
    const messageId = parseInt(messageIdStr, 10);

    if (isNaN(index) || isNaN(answer) || isNaN(messageId) || messageId <= 0) {
      console.error(
        "[ERROR] NaN or invalid parsed values →",
        { indexStr, answerStr, messageIdStr }
      );
      await ctx.answerCbQuery(
        "Something went wrong with this question. Try restarting.",
        { show_alert: true }
      );
      return;
    }

    const questions = exams[examName];
    if (!questions || !Array.isArray(questions)) {
      await ctx.answerCbQuery("Exam data not available.", { show_alert: true });
      return;
    }

    const q = questions[index];
    if (!q) {
      await ctx.answerCbQuery("Question not found.", { show_alert: true });
      return;
    }

    let resultText;
    if (answer === q.correct) {
      resultText = "✅ Correct!";
    } else {
      resultText = `❌ Wrong\nCorrect: ${q.options[q.correct]}`;
    }

    await ctx.answerCbQuery(resultText, { show_alert: true });

    const nextIndex = index + 1;
    if (nextIndex < questions.length) {
      await sendQuestion(ctx, examName, nextIndex, messageId);
    } else {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          messageId,
          undefined,
          "🎉 Exam Finished!\nThank you for practicing."
        );
      } catch (editErr) {
        console.error("Final edit failed:", editErr);
        await ctx.reply("Exam Finished! Thank you for practicing.");
      }
    }

  } catch (error) {
    console.error("Answer handling error:", error);
    await ctx.answerCbQuery(
      "Error processing answer. Question may have expired.",
      { show_alert: true }
    );
  }
});

// WEBHOOK HANDLER (Vercel)
module.exports = async (req, res) => {
  if (req.method === "POST") {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).send("ok");
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.status(200).send("Bot is running");
  }
};