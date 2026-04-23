import mongoose from "mongoose";

const adminMessageLogSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    Name: { type: String, default: "" },
    PhnNumber: { type: String, default: "" },
    role: {
      type: String,
      enum: ["user", "admin"],
      required: true,
    },
    message: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

export const AdminMessageLog = mongoose.model("AdminMessageLog", adminMessageLogSchema, "admin");
