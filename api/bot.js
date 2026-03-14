const { Telegraf } = require("telegraf");
const fs = require("fs"); // still needed? only if you add logging later – can be removed otherwise
const path = require("path"); // can be removed if not used elsewhere

const bot = new Telegraf(process.env.BOT_TOKEN);

// EXAM DATA – loaded statically at startup (Vercel bundles these automatically)
let exams = {};

try {
  exams = {
    exit_2025: require("./exams/exit/2025.json"),
    model_aau: require("./exams/model/aau.json"),
    model_aastu: require("./exams/model/aastu.json")
  };
  console.log("Exams loaded successfully. Available keys:", Object.keys(exams));
} catch (err) {
  console.error("Failed to load one or more exam files at startup:", err);
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
        [{ text: "Last Year Exit Exam", callback_data: "start_exit_2025" }]
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
        [{ text: "AAU Exit Exam", callback_data: "start_model_aau" }],
        [{ text: "AASTU Exit Exam", callback_data: "start_model_aastu" }]
      ]
    }
  });
});

// START EXAM
bot.action(/start_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const examName = ctx.match[1];
  const msg = await ctx.reply("Exam Started...");
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
        null,
        "Exam not found or data is invalid."
      );
      return;
    }

    if (index >= questions.length || index < 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        "Invalid question index."
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

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      null,
      text,
      { reply_markup: keyboard }
    );

  } catch (error) {
    console.error("Question send error:", error);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      null,
      "Failed to load question. Please try again."
    );
  }
}

// HANDLE ANSWER
bot.action(/ans_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const [examName, indexStr, answerStr, messageIdStr] = ctx.match[1].split("_");
    const index = parseInt(indexStr);
    const answer = parseInt(answerStr);
    const messageId = parseInt(messageIdStr);

    const questions = exams[examName];

    if (!questions || !Array.isArray(questions)) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        "Exam data not available."
      );
      return;
    }

    const q = questions[index];
    if (!q) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        "Question not found."
      );
      return;
    }

    let resultText;
    if (answer === q.correct) {
      resultText = "✅ Correct!";
    } else {
      resultText = `❌ Wrong\nCorrect answer: ${q.options[q.correct]}`;
    }

    await ctx.answerCbQuery(resultText, { show_alert: true });

    const nextIndex = index + 1;
    if (nextIndex < questions.length) {
      await sendQuestion(ctx, examName, nextIndex, messageId);
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        "🎉 Exam Finished!\nThank you for practicing."
      );
    }

  } catch (error) {
    console.error("Answer handling error:", error);
    await ctx.answerCbQuery("Error processing your answer", { show_alert: true });
  }
});

// WEBHOOK HANDLER (for Vercel)
module.exports = async (req, res) => {
  if (req.method === "POST") {
    try {
      await bot.handleUpdate(req.body, ctx => {
        // optional: can add extra context if needed
      });
      res.status(200).send("ok");
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.status(200).send("Bot is running");
  }
};