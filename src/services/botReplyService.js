const BOT_TEMPLATE_SEED = [
  {
    module: "GREETING_ONBOARDING",
    triggerKeywords: ["hi", "hello", "hii", "hey"],
    replies: ["```json\n{\"module\":\"GREETING_ONBOARDING\"}\n```"],
  },
  {
    module: "PROJECT_LIST",
    triggerKeywords: ["project", "projects", "list", "choose"],
    replies: ["```json\n{\"module\":\"PROJECT_LIST\"}\n```"],
  },
  {
    module: "PROJECT_EXPLANATION",
    triggerKeywords: ["global", "telecom", "explain", "details"],
    replies: ["```json\n{\"module\":\"PROJECT_EXPLANATION\"}\n```"],
  },
  {
    module: "PROJECT_ADVANCED_DETAILS",
    triggerKeywords: ["process", "advanced", "how", "steps"],
    replies: ["```json\n{\"module\":\"PROJECT_ADVANCED_DETAILS\"}\n```"],
  },
];

export function pickBotReply(templates, userText) {
  const text = (userText || "").toLowerCase();

  const matched = templates.find((tpl) =>
    tpl.triggerKeywords.some((keyword) => text.includes(keyword.toLowerCase())),
  );

  const fallback =
    templates.find((tpl) => tpl.module === "GREETING_ONBOARDING") || templates[0] || null;

  const chosen = matched || fallback;

  if (!chosen) {
    return "```json\n{\"module\":\"GREETING_ONBOARDING\"}\n```";
  }

  if (!chosen.replies.length) {
    return `\`\`\`json\n{\"module\":\"${chosen.module}\"}\n\`\`\``;
  }

  return chosen.replies[Math.floor(Math.random() * chosen.replies.length)];
}

export function getSeedTemplates() {
  return BOT_TEMPLATE_SEED;
}
