const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// EXAM DATA – loaded once at startup
let exams = {};

try {
  const rawExams = {
    exit2025: require("./exams/exit/2025.json"),
    modelaastu2: require("./exams/model/aastu2.json"),
    modelaastu: require("./exams/model/aastu.json"),
    model: require("./exams/model/model.json"),
    model2: require("./exams/model/model2.json"),
  };

  exams = rawExams;

  console.log("Exams loaded. Keys:", Object.keys(exams));
} catch (err) {
  console.error("Failed to load exam files:", err);
}

// START COMMAND
bot.start(async (ctx) => {
  await ctx.reply("Welcome to Exit Exam Preparation Bot", {
    reply_markup: {
      keyboard: [["Start Exam Menu"]],
      resize_keyboard: true,
    },
  });
});

// START MENU
bot.hears(/Start Exam Menu/, async (ctx) => {
  await ctx.reply("Select Exam Type", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Exit Exam", callback_data: "exit_exam" }],
        [{ text: "Model Exit Exam", callback_data: "model_exam" }],
      ],
    },
  });
});

// EXIT EXAM MENU
bot.action("exit_exam", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Select Exit Exam", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Last Year Exit Exam", callback_data: "start_exit2025" }],
      ],
    },
  });
});

// MODEL EXAM MENU
bot.action("model_exam", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Select Model Exit Exam", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "AASTU Model Exit Exam 1",
            callback_data: "start_modelaastu2",
          },
        ],
        [
          {
            text: "AASTU Model Exit Exam 2",
            callback_data: "start_modelaastu",
          },
        ],
        [{ text: "Model Exit Exam 1", callback_data: "start_model2" }],
        [{ text: "Model Exit Exam 2", callback_data: "start_model" }],
      ],
    },
  });
});

// START EXAM – initialize score 0/0
bot.action(/start_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const examName = ctx.match[1];

  const msg = await ctx.reply("Exam Started...");

  console.log("[DEBUG] Starting exam → initial message_id =", msg.message_id);

  // Start with score 0/0
  await sendQuestion(ctx, examName, 0, msg.message_id, 0, 0);
});

// SEND QUESTION FUNCTION – now accepts current score
async function sendQuestion(
  ctx,
  examName,
  index,
  messageId,
  correctCount = 0,
  attemptedCount = 0,
) {
  try {
    const questions = exams[examName];

    if (!questions || !Array.isArray(questions)) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        "Exam not found or data is invalid.",
      );
      return;
    }

    if (index >= questions.length || index < 0) {
      // Final screen with final score
      const finalScore = `${correctCount} / ${attemptedCount}`;
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        `🎉 Exam Finished!\n\nFinal Score: **${finalScore}**\n\nThank you for practicing.\nYou can start again with the menu.`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    const q = questions[index];

    const questionHeader =
      q.number && q.number > 0 ? `Question ${q.number}` : "Question";

    const text = `${questionHeader}\n\n${q.question}\n\nA. ${q.options[0]}\nB. ${q.options[1]}\nC. ${q.options[2]}\nD. ${q.options[3]}`;

    const keyboard = {
      inline_keyboard: q.options.map((opt, i) => [
        {
          text: opt,
          callback_data: `ans_${examName}_${index}_${i}_${messageId}_${correctCount}_${attemptedCount}`,
        },
      ]),
    };

    console.log(
      `[DEBUG] Sending ${questionHeader} (index ${index}) | score ${correctCount}/${attemptedCount} | msgId=${messageId}`,
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      text,
      { reply_markup: keyboard },
    );
  } catch (error) {
    console.error("Question send error:", error);
    await ctx.reply(
      "Failed to load/update question. Please try again or restart.",
    );
  }
}

// HANDLE ANSWER – update score and show feedback
bot.action(/ans_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const parts = ctx.match[1].split("_");
    if (parts.length !== 6) {
      console.error("[ERROR] Invalid callback_data parts:", parts);
      await ctx.answerCbQuery("Invalid question data.", { show_alert: true });
      return;
    }

    const [
      examName,
      indexStr,
      answerStr,
      messageIdStr,
      prevCorrectStr,
      prevAttemptedStr,
    ] = parts;

    const index = parseInt(indexStr, 10);
    const answer = parseInt(answerStr, 10);
    const messageId = parseInt(messageIdStr, 10);
    let correctCount = parseInt(prevCorrectStr, 10);
    let attemptedCount = parseInt(prevAttemptedStr, 10);

    if (
      isNaN(index) ||
      isNaN(answer) ||
      isNaN(messageId) ||
      messageId <= 0 ||
      isNaN(correctCount) ||
      isNaN(attemptedCount)
    ) {
      console.error("[ERROR] Invalid parsed values");
      await ctx.answerCbQuery("Something went wrong. Try restarting.", {
        show_alert: true,
      });
      return;
    }

    // Increment attempted count (every answer counts as an attempt)
    attemptedCount += 1;

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

    const isCorrect = answer === q.correct;

    // Update correct count if answer is right
    if (isCorrect) {
      correctCount += 1;
    }

    const userChoice = q.options[answer] || "(invalid option)";
    const correctAnswer = q.options[q.correct];

    let feedback = isCorrect
      ? "✅ **Correct!**"
      : `❌ **Wrong!**\nCorrect answer: **${correctAnswer}**`;

    feedback += `\n\nYour answer: **${userChoice}**`;

    const questionHeader =
      q.number && q.number > 0 ? `Question ${q.number}` : "Question";

    const displayText = `${questionHeader}\n\n${q.question}\n\nA. ${q.options[0]}\nB. ${q.options[1]}\nC. ${q.options[2]}\nD. ${q.options[3]}\n\n${feedback}\n\n**Score: ${correctCount} / ${attemptedCount}**`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "➡️ Next Question",
            callback_data: `next_${examName}_${index + 1}_${messageId}_${correctCount}_${attemptedCount}`,
          },
        ],
        [
          {
            text: "🏁 End Exam",
            callback_data: `end_${examName}_${messageId}_${correctCount}_${attemptedCount}`,
          },
        ],
      ],
    };

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      displayText,
      {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      },
    );
  } catch (error) {
    console.error("Answer handling error:", error);
    await ctx.answerCbQuery("Error processing answer.", { show_alert: true });
  }
});

// NEXT QUESTION – pass current score forward
bot.action(/next_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const parts = ctx.match[1].split("_");
    if (parts.length !== 5) return;

    const [examName, nextIndexStr, messageIdStr, correctStr, attemptedStr] =
      parts;
    const nextIndex = parseInt(nextIndexStr, 10);
    const messageId = parseInt(messageIdStr, 10);
    const correctCount = parseInt(correctStr, 10);
    const attemptedCount = parseInt(attemptedStr, 10);

    if (
      isNaN(nextIndex) ||
      isNaN(messageId) ||
      isNaN(correctCount) ||
      isNaN(attemptedCount)
    )
      return;

    await sendQuestion(
      ctx,
      examName,
      nextIndex,
      messageId,
      correctCount,
      attemptedCount,
    );
  } catch (err) {
    console.error("Next question error:", err);
    await ctx.answerCbQuery("Could not load next question.", {
      show_alert: true,
    });
  }
});

// END EXAM EARLY – show final score
bot.action(/end_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const parts = ctx.match[1].split("_");
    if (parts.length < 2) return;

    const examName = parts[0];
    const messageId = parseInt(parts[1], 10);
    const correctCount = parts.length > 2 ? parseInt(parts[2], 10) : 0;
    const attemptedCount = parts.length > 3 ? parseInt(parts[3], 10) : 0;

    if (isNaN(messageId)) return;

    const finalScore = `${correctCount} / ${attemptedCount}`;

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      `🏁 **Exam ended early.**\n\nFinal Score: **${finalScore}**\n\nYou can start a new session anytime with /start or the menu button.`,
      { parse_mode: "Markdown" },
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
