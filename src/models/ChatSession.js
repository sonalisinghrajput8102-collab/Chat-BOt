import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["human", "ai", "admin"],
      required: true,
    },
    source: {
      type: String,
      enum: ["user", "bot", "admin"],
      default: "user",
    },
    data: {
      content: { type: String, required: true },
      additional_kwargs: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      response_metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      tool_calls: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },
      invalid_tool_calls: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    deliveredToUser: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: true,
  },
);

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    Name: { type: String, default: "" },
    PhnNumber: { type: String, default: "" },
    status: {
      type: String,
      enum: ["ALL", "LIVE", "RECENT", "CLOSED"],
      default: "LIVE",
    },
    unread: { type: Number, default: 0 },
    isBotActive: { type: Boolean, default: true },
    botManualState: { type: Boolean, default: undefined },
    botStatus: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    adminStatus: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "INACTIVE",
    },
    lastSeenAt: { type: Date, default: null },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const ChatSession = mongoose.model("ChatSession", chatSessionSchema, "chats");
