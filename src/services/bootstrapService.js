import { BotTemplate } from "../models/BotTemplate.js";
import { getSeedTemplates } from "./botReplyService.js";

export async function ensureBotTemplates() {
  const seed = getSeedTemplates();

  await Promise.all(
    seed.map((item) =>
      BotTemplate.updateOne(
        { module: item.module },
        {
          $setOnInsert: {
            module: item.module,
            triggerKeywords: item.triggerKeywords,
            replies: item.replies,
            enabled: true,
          },
        },
        { upsert: true },
      ),
    ),
  );
}
