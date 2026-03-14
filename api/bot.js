const { Telegraf } = require("telegraf")
const fs = require("fs")
const path = require("path")

const bot = new Telegraf(process.env.BOT_TOKEN)


// EXAM FILE MAP
// These paths are now relative to __dirname (inside api/)
const exams = {
  exit_2025: "exams/exit/2025.json",
  model_aau: "exams/model/aau.json",
  model_aastu: "exams/model/aastu.json"
}



// START
bot.start(async (ctx) => {
  await ctx.reply("Welcome to Exit Exam Preparation Bot", {
    reply_markup: {
      keyboard: [["Start Exam Menu"]],
      resize_keyboard: true
    }
  })
})



// START MENU
bot.hears(/Start Exam Menu/, async (ctx) => {
  await ctx.reply("Select Exam Type", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Exit Exam", callback_data: "exit_exam" }],
        [{ text: "Model Exit Exam", callback_data: "model_exam" }]
      ]
    }
  })
})



// EXIT EXAM MENU
bot.action("exit_exam", async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.reply("Select Exit Exam", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Last Year Exit Exam", callback_data: "start_exit_2025" }]
      ]
    }
  })
})



// MODEL EXAM MENU
bot.action("model_exam", async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.reply("Select Model Exit Exam", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "AAU Exit Exam", callback_data: "start_model_aau" }],
        [{ text: "AASTU Exit Exam", callback_data: "start_model_aastu" }]
      ]
    }
  })
})



// START EXAM
bot.action(/start_(.+)/, async (ctx) => {
  await ctx.answerCbQuery()
  const examName = ctx.match[1]
  const msg = await ctx.reply("Exam Started")
  await sendQuestion(ctx, examName, 0, msg.message_id)
})



// SEND QUESTION
async function sendQuestion(ctx, examName, index, messageId) {
  try {
    const relativePath = exams[examName]
    if (!relativePath) {
      await ctx.reply("Exam not found.")
      return
    }

    const filePath = path.join(process.cwd(), relativePath);
    
console.log("Runtime cwd:       ", process.cwd());
console.log("Trying file path:  ", filePath);
console.log("Does file exist?   ", fs.existsSync(filePath) ? "YES" : "NO");
    const questions = JSON.parse(fs.readFileSync(filePath, "utf8"))

    const q = questions[index]
    const text = `Question ${index + 1} / ${questions.length}\n\n${q.question}`

    const keyboard = {
      inline_keyboard: q.options.map((opt, i) => [{
        text: opt,
        callback_data: `ans_${examName}_${index}_${i}_${messageId}`
      }])
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      null,
      text,
      { reply_markup: keyboard }
    )

  } catch (error) {
    console.error("Question load error:", error)
    await ctx.reply("Failed to load question.")
  }
}



// HANDLE ANSWER
bot.action(/ans_(.+)/, async (ctx) => {
  await ctx.answerCbQuery()

  try {
    const [examName, indexStr, answerStr, messageIdStr] = ctx.match[1].split("_")
    const index = parseInt(indexStr)
    const answer = parseInt(answerStr)
    const messageId = parseInt(messageIdStr)

    const relativePath = exams[examName]
    if (!relativePath) return

    const filePath = path.join(__dirname, relativePath)
    const questions = JSON.parse(fs.readFileSync(filePath, "utf8"))

    const q = questions[index]

    let resultText
    if (answer === q.correct) {
      resultText = "Correct"
    } else {
      resultText = `Wrong\nCorrect answer: ${q.options[q.correct]}`
    }

    await ctx.answerCbQuery(resultText)

    const nextIndex = index + 1
    if (nextIndex < questions.length) {
      await sendQuestion(ctx, examName, nextIndex, messageId)
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        null,
        "Exam Finished"
      )
    }

  } catch (error) {
    console.error("Answer error:", error)
    await ctx.reply("Error processing answer.")
  }
})



// WEBHOOK HANDLER
module.exports = async (req, res) => {
  if (req.method === "POST") {
    try {
      await bot.handleUpdate(req.body)
    } catch (error) {
      console.error(error)
    }
    res.status(200).send("ok")
  } else {
    res.status(200).send("Bot running")
  }
}