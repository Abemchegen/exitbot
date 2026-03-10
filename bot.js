const { Telegraf } = require("telegraf");
const fs = require("fs");
require("dotenv").config({ quiet: true });

const token = process.env.token;

if (!token) {
  throw new Error("Missing bot token. Set TELEGRAM_BOT_TOKEN in .env");
}

const bot = new Telegraf(token);

const userState = {};

/*
START COMMAND
*/
bot.start(async (ctx) => {
  userState[ctx.from.id] = {};

  await ctx.reply("Welcome to Exit Exam Preparation Bot", {
    reply_markup: {
      keyboard: [["Start Exam Menu"]],
      resize_keyboard: true,
    },
  });
});

/*
START MENU BUTTON
*/
bot.hears("Start Exam Menu", async (ctx) => {
  await ctx.reply("Select Exam Type", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Exit Exam", callback_data: "exit_exam" }],
        [{ text: "Model Exit Exam", callback_data: "model_exam" }],
      ],
    },
  });
});

/*
EXIT EXAM MENU
*/
bot.action("exit_exam", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply("Select Exit Exam", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Last Year Exit Exam", callback_data: "exit_2025" }],
      ],
    },
  });
});

/*
MODEL EXAM MENU
*/
bot.action("model_exam", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply("Select Model Exit Exam", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "AAU Exit Exam", callback_data: "model_aau" }],
        [{ text: "AASTU Exit Exam", callback_data: "model_aastu" }],
      ],
    },
  });
});

/*
LOAD EXAMS
*/
bot.action("exit_2025", async (ctx) => {
  await loadExam(ctx, "./exams/exit/2025.json", "Exit Exam Started");
});

bot.action("model_aau", async (ctx) => {
  await loadExam(ctx, "./exams/model/aau.json", "AAU Model Exam Started");
});

bot.action("model_aastu", async (ctx) => {
  await loadExam(ctx, "./exams/model/aastu.json", "AASTU Model Exam Started");
});

/*
LOAD EXAM FUNCTION
*/
async function loadExam(ctx, file, message) {
  await ctx.answerCbQuery();

  const questions = JSON.parse(fs.readFileSync(file));

  userState[ctx.from.id] = {
    questions: questions,
    index: 0,
    score: 0,
  };

  await ctx.reply(message);

  await sendQuestion(ctx);
}

/*
SEND QUESTION
*/
async function sendQuestion(ctx) {
  const state = userState[ctx.from.id];

  if (!state) return;

  const q = state.questions[state.index];

  await ctx.reply(
    `Question ${state.index + 1} / ${state.questions.length}\n\n${q.question}`,
    {
      reply_markup: {
        inline_keyboard: [
          q.options.map((opt, i) => ({
            text: opt,
            callback_data: "ans_" + i,
          })),
        ],
      },
    },
  );
}

/*
ANSWER HANDLER
*/
bot.action(/ans_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const state = userState[ctx.from.id];

  if (!state) return;

  const q = state.questions[state.index];

  const answer = parseInt(ctx.match[1]);

  if (answer === q.correct) {
    state.score++;

    await ctx.reply("Correct");
  } else {
    await ctx.reply(`Wrong\nCorrect answer: ${q.options[q.correct]}`);
  }

  state.index++;

  if (state.index < state.questions.length) {
    await sendQuestion(ctx);
  } else {
    await ctx.reply(
      `Exam Finished\n\nScore: ${state.score}/${state.questions.length}`,
    );

    delete userState[ctx.from.id];
  }
});

bot.launch();

console.log("Bot running...");
