import mongoose from "mongoose";

export async function connectDatabase(uri) {
  if (!uri) {
    throw new Error("MONGODB_URI is missing in environment variables.");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
}
