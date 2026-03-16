const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// EXAM DATA – loaded once at startup
let exams = {};

try {
  const rawExams = {
    exit2025:   require("./exams/exit/2025.json"),
    modelaau:   require("./exams/model/aau.json"),
    modelaastu: require("./exams/model/aastu.json")
  };

  // Sort each exam's questions by "number" (0 goes to the end)
  Object.keys(rawExams).forEach(key => {
    exams[key] = rawExams[key].sort((a, b) => {
      if (a.number === 0 && b.number === 0) return 0;
      if (a.number === 0) return 1;
      if (b.number === 0) return -1;
      return a.number - b.number;
    });
  });

  console.log("Exams loaded and sorted. Keys:", Object.keys(exams));
} catch (err) {
  console.error("Failed to load or sort exam files:", err);
}

// START COMMAND
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
        [{ text: "Exit Exam",       callback_data: "exit_exam" }],
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

  console.log("[DEBUG] Starting exam → initial message_id =", msg.message_id);

  await sendQuestion(ctx, examName, 0, msg.message_id);
});

// SEND QUESTION FUNCTION
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
        "No more questions available."
      );
      return;
    }

    const q = questions[index];

    // Use original question number if it exists and is > 0, otherwise use position
    const questionNumber = (q.number && q.number > 0) ? q.number : (index + 1);
    const totalQuestions = questions.length;

    const text = `Question ${questionNumber} / ${totalQuestions}\n\n${q.question}`;

    const keyboard = {
      inline_keyboard: q.options.map((opt, i) => [{
        text: opt,
        callback_data: `ans_${examName}_${index}_${i}_${messageId}`
      }])
    };

    console.log(
      `[DEBUG] Sending Q${questionNumber} (index ${index}) | msgId=${messageId}`
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
    await ctx.reply("Failed to load/update question. Please try again or restart.");
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
      console.error("[ERROR] Invalid parsed values:", { indexStr, answerStr, messageIdStr });
      await ctx.answerCbQuery("Something went wrong. Try restarting.", { show_alert: true });
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

    const isCorrect     = answer === q.correct;
    const userChoice    = q.options[answer] || "(invalid option)";
    const correctAnswer = q.options[q.correct];

    let feedback = isCorrect
      ? "✅ **Correct!**"
      : `❌ **Wrong!**\nCorrect answer: **${correctAnswer}**`;

    feedback += `\n\nYour answer: **${userChoice}**`;

    // Optional explanation support
    // if (q.explanation) {
    //   feedback += `\n\n**Explanation:**\n${q.explanation}`;
    // }

    // Use original number for display in feedback too
    const questionNumber = (q.number && q.number > 0) ? q.number : (index + 1);
    const totalQuestions = questions.length;

    const displayText = `Question ${questionNumber} / ${totalQuestions}\n\n${q.question}\n\n${feedback}`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "➡️ Next Question",
            callback_data: `next_${examName}_${index + 1}_${messageId}`
          }
        ],
        [
          {
            text: "🏁 End Exam",
            callback_data: `end_${examName}_${messageId}`
          }
        ]
      ]
    };

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      displayText,
      {
        reply_markup: keyboard,
        parse_mode: "Markdown"
      }
    );

  } catch (error) {
    console.error("Answer handling error:", error);
    await ctx.answerCbQuery("Error processing answer.", { show_alert: true });
  }
});

// NEXT QUESTION
bot.action(/next_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const parts = ctx.match[1].split("_");
    if (parts.length !== 3) return;

    const [examName, nextIndexStr, messageIdStr] = parts;
    const nextIndex = parseInt(nextIndexStr, 10);
    const messageId = parseInt(messageIdStr, 10);

    if (isNaN(nextIndex) || isNaN(messageId)) return;

    await sendQuestion(ctx, examName, nextIndex, messageId);

  } catch (err) {
    console.error("Next question error:", err);
    await ctx.answerCbQuery("Could not load next question.", { show_alert: true });
  }
});

// END EXAM EARLY
bot.action(/end_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const parts = ctx.match[1].split("_");
    if (parts.length !== 2) return;

    const [examName, messageIdStr] = parts;
    const messageId = parseInt(messageIdStr, 10);

    if (isNaN(messageId)) return;

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      "🏁 **Exam ended early.**\n\nYou can start a new session anytime with /start or the menu button.",
      { parse_mode: "Markdown" }
    );

  } catch (err) {
    console.error("End exam error:", err);
  }
});

// WEBHOOK HANDLER FOR VERCEL
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