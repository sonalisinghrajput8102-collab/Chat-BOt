import mongoose from "mongoose";

const botTemplateSchema = new mongoose.Schema(
  {
    module: { type: String, required: true, unique: true },
    triggerKeywords: { type: [String], default: [] },
    replies: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

export const BotTemplate = mongoose.model("BotTemplate", botTemplateSchema, "bot_templates");
