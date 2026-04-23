import { formatChatTime, formatRelativeTime } from "../utils/time.js";

function resolveMessageCreatedAt(message) {
  const fromMessageId =
    typeof message?._id?.getTimestamp === "function" ? message._id.getTimestamp() : undefined;

  const candidates = [
    message?.createdAt,
    message?.timestamp,
    fromMessageId,
    message?.data?.createdAt,
    message?.data?.timestamp,
    message?.data?.additional_kwargs?.createdAt,
    message?.data?.additional_kwargs?.timestamp,
    message?.data?.response_metadata?.createdAt,
    message?.data?.response_metadata?.timestamp,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return undefined;
}

function mapMessageSender(message) {
  if (!message || typeof message !== "object") return "BOT";

  if (message.type === "human") return "USER";
  if (message.type === "admin") return "AGENT";

  if (message.source === "admin") return "AGENT";
  return "BOT";
}

function mapMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  if (message.source === "bot" && message.deliveredToUser === false) {
    return null;
  }

  const rawData = message.data && typeof message.data === "object" ? message.data : {};
  const rawAdditional =
    rawData.additional_kwargs && typeof rawData.additional_kwargs === "object"
      ? rawData.additional_kwargs
      : {};
  const replyTo = rawAdditional.replyTo;
  const createdAt = resolveMessageCreatedAt(message);

  return {
    id: String(message._id),
    sender: mapMessageSender(message),
    text: typeof rawData.content === "string" ? rawData.content : "",
    time: createdAt ? formatChatTime(createdAt) : "",
    createdAt,
    replyTo: replyTo
      ? {
          id: replyTo.id,
          sender: replyTo.sender,
          text: replyTo.text,
        }
      : undefined,
  };
}

export function mapSessionToChat(session) {
  const sourceMessages = Array.isArray(session?.messages) ? session.messages : [];
  const messages = sourceMessages.map(mapMessage).filter(Boolean);
  const lastMessage = messages[messages.length - 1];
  const safeName =
    typeof session.Name === "string" && session.Name.trim().toLowerCase() === "unknown user"
      ? ""
      : session.Name || "";

  const effectiveBotState =
    typeof session.botManualState === "boolean" ? session.botManualState : session.isBotActive;

  return {
    id: session.PhnNumber || session.sessionId || "",
    userName: safeName,
    userPhone: "",
    status: session.status || "LIVE",
    unread: session.unread || 0,
    lastMessage: lastMessage?.text || "",
    lastTime: lastMessage ? formatRelativeTime(session.updatedAt) : "",
    isOnline: Boolean(session.isOnline ?? true),
    lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : undefined,
    isBotActive: Boolean(effectiveBotState ?? true),
    botStatus: session.botStatus || "ACTIVE",
    adminStatus: session.adminStatus || "INACTIVE",
    updatedAt: session.updatedAt ? new Date(session.updatedAt).toISOString() : undefined,
    messages,
  };
}
