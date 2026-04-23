import mongoose from "mongoose";

const gptBotLogSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    time: { type: String, required: true },
    PhnNumber: { type: String, default: "" },
    Name: { type: String, default: "" },
    userMsg: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

export const GptBotLog = mongoose.model("GptBotLog", gptBotLogSchema, "gptbot");
