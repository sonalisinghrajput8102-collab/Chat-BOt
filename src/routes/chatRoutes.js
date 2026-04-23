import express from "express";
import { ChatSession } from "../models/ChatSession.js";
import { GptBotLog } from "../models/GptBotLog.js";
import { AdminMessageLog } from "../models/AdminMessageLog.js";
import { BotTemplate } from "../models/BotTemplate.js";
import { pickBotReply } from "../services/botReplyService.js";
import { mapSessionToChat } from "../services/chatMapper.js";
import { formatClockTime } from "../utils/time.js";

const router = express.Router();

function safeMapSessionToChat(sessionLike) {
    try {
        return mapSessionToChat(sessionLike);
    } catch (error) {
        console.error("mapSessionToChat failed, using fallback payload:", error);

        const sessionId = sessionLike?.PhnNumber || sessionLike?.sessionId || "";
        const name = typeof sessionLike?.Name === "string" ? sessionLike.Name : "";
        const phone = typeof sessionLike?.PhnNumber === "string" ? sessionLike.PhnNumber : "";
        const status = sessionLike?.status || "LIVE";
        const unread = Number(sessionLike?.unread || 0);
        const isBotActive = Boolean(sessionLike?.isBotActive ?? true);

        return {
            id: sessionId,
            userName: name,
            userPhone: "",
            status,
            unread,
            lastMessage: "",
            lastTime: "",
            isOnline: true,
            isBotActive,
            messages: [],
        };
    }
}

function pickFirstNonEmpty(values) {
    for (const value of values) {
        if (typeof value === "string") {
            const normalized = value.trim();
            if (normalized && normalized.toLowerCase() !== "unknown user") {
                return normalized;
            }
        }
    }
    return "";
}

function resolveSessionIdentifier(input = {}) {
    return pickFirstNonEmpty([input.number, input.sessionId, input.phone]);
}

function findSessionByIdentifier(identifier) {
    return ChatSession.findOne({
        $or: [{ sessionId: identifier }, { PhnNumber: identifier }],
    });
}

async function resolveIdentity(sessionLike, incoming = {}) {
    const incomingName = pickFirstNonEmpty([incoming.name]);
    const incomingPhone = pickFirstNonEmpty([incoming.phone]);

    let resolvedName = pickFirstNonEmpty([
        incomingName,
        sessionLike?.Name,
        sessionLike?.name,
        sessionLike?.userName,
        sessionLike?.profile?.name,
    ]);

    let resolvedPhone = pickFirstNonEmpty([
        incomingPhone,
        sessionLike?.PhnNumber,
        sessionLike?.phnNumber,
        sessionLike?.phone,
        sessionLike?.userPhone,
    ]);

    if ((!resolvedName || !resolvedPhone) && sessionLike?.sessionId) {
        const latestLog = await GptBotLog.findOne({ sessionId: sessionLike.sessionId })
            .sort({ createdAt: -1 })
            .lean();

        if (latestLog) {
            if (!resolvedName) {
                resolvedName = pickFirstNonEmpty([latestLog.Name]);
            }
            if (!resolvedPhone) {
                resolvedPhone = pickFirstNonEmpty([latestLog.PhnNumber]);
            }
        }
    }

    return {
        name: resolvedName || "",
        phone: resolvedPhone || "",
    };
}

function normalizeSessionStatus(session) {
    const effectiveBotState =
        typeof session.botManualState === "boolean" ? session.botManualState : session.isBotActive;
    session.isBotActive = Boolean(effectiveBotState);

    if (!session.botStatus) {
        session.botStatus = session.isBotActive ? "ACTIVE" : "INACTIVE";
    }
    if (!session.adminStatus) {
        session.adminStatus = session.isBotActive ? "INACTIVE" : "ACTIVE";
    }
}

function normalizeMessageTimestamps(session) {
    if (!Array.isArray(session.messages)) {
        session.messages = [];
        return true;
    }

    let changed = false;

    (session.messages || []).forEach((message, index) => {
        if (!message || typeof message !== "object") {
            return;
        }

        const current = message?.createdAt ? new Date(message.createdAt) : null;
        if (current && !Number.isNaN(current.getTime())) {
            return;
        }

        const fromMessageId =
            typeof message?._id?.getTimestamp === "function" ? message._id.getTimestamp() : null;
        const fromSessionCreatedAt = session?.createdAt ? new Date(session.createdAt) : null;
        const fallbackFromOrder =
            fromSessionCreatedAt && !Number.isNaN(fromSessionCreatedAt.getTime()) ?
            new Date(fromSessionCreatedAt.getTime() + index * 1000) :
            null;

        message.createdAt = fromMessageId || fallbackFromOrder || new Date();
        changed = true;
    });

    return changed;
}

async function safeCreateAdminLog(payload) {
    try {
        await AdminMessageLog.create(payload);
    } catch (error) {
        console.error("Admin log save failed:", error);
    }
}

async function safeCreateGptLog(payload) {
    try {
        await GptBotLog.create(payload);
    } catch (error) {
        console.error("GPT log save failed:", error);
    }
}

async function createOrAppendIncomingMessage({ sessionId, text, name, phone }) {
    const identitySeed = { sessionId };
    const { name: resolvedName, phone: resolvedPhone } = await resolveIdentity(identitySeed, {
        name,
        phone,
    });

    let session = await findSessionByIdentifier(sessionId);
    const resolvedSessionId = session?.sessionId || sessionId;

    if (!session) {
        session = await ChatSession.create({
            sessionId: resolvedSessionId,
            Name: resolvedName,
            PhnNumber: resolvedPhone || sessionId,
            status: "LIVE",
            unread: 0,
            isBotActive: true,
            botManualState: true,
            botStatus: "ACTIVE",
            adminStatus: "INACTIVE",
            messages: [],
        });
    }

    const identity = await resolveIdentity(session, { name, phone });
    session.Name = identity.name;
    session.PhnNumber = identity.phone || sessionId;

    normalizeSessionStatus(session);

    session.messages.push({
        type: "human",
        source: "user",
        data: {
            content: text,
            additional_kwargs: {},
            response_metadata: {},
        },
        createdAt: new Date(),
        deliveredToUser: true,
    });

    session.unread = (session.unread || 0) + 1;
    session.lastSeenAt = new Date();

    let botReply = null;
    if (session.isBotActive) {
        const templates = await BotTemplate.find({ enabled: true }).lean();
        botReply = pickBotReply(templates, text);

        session.messages.push({
            type: "ai",
            source: "bot",
            data: {
                content: botReply,
                additional_kwargs: {},
                response_metadata: {
                    deliveredAt: new Date().toISOString(),
                },
                tool_calls: [],
                invalid_tool_calls: [],
            },
            createdAt: new Date(),
            deliveredToUser: true,
        });
    }

    await session.save({ validateBeforeSave: false });

    await Promise.all([
        safeCreateGptLog({
            sessionId: resolvedSessionId,
            time: formatClockTime(new Date()),
            PhnNumber: session.PhnNumber,
            Name: session.Name,
            userMsg: text,
        }),
        safeCreateAdminLog({
            sessionId: resolvedSessionId,
            Name: session.Name,
            PhnNumber: session.PhnNumber,
            role: "user",
            message: text,
        }),
    ]);

    const latest = await ChatSession.findById(session._id).lean();
    return {
        botReply,
        chat: safeMapSessionToChat(latest),
    };
}

router.get("/health", (_req, res) => {
    res.json({ ok: true });
});

router.get("/chats", async(_req, res, next) => {
    try {
        const sessions = await ChatSession.find({}).sort({ updatedAt: -1 });

        const normalizedSessions = await Promise.all(
            sessions.map(async(session) => {
                const identity = await resolveIdentity(session);
                const needsNameFix = !session.Name || String(session.Name).trim().toLowerCase() === "unknown user";
                const needsPhoneFix = !session.PhnNumber;
                const needsMessageTimestampFix = normalizeMessageTimestamps(session);

                if (needsNameFix || needsPhoneFix || needsMessageTimestampFix) {
                    session.Name = identity.name;
                    session.PhnNumber = identity.phone;
                    await session.save({ validateBeforeSave: false });
                }

                return session.toObject();
            }),
        );

        const chats = normalizedSessions.map(safeMapSessionToChat);
        res.json({ chats });
    } catch (error) {
        next(error);
    }
});

router.post("/chats/incoming", async(req, res, next) => {
    try {
        const { text, name, phone } = req.body;
        const sessionId = resolveSessionIdentifier(req.body);

        if (!sessionId || !text) {
            return res.status(400).json({ error: "number (or sessionId) and text are required." });
        }
        const { botReply, chat } = await createOrAppendIncomingMessage({
            sessionId,
            text,
            name,
            phone,
        });

        return res.json({
            ok: true,
            autoReplySent: Boolean(botReply),
            botReply,
            chat,
        });
    } catch (error) {
        next(error);
    }
});

router.post("/chats/:sessionId/user-message", async(req, res, next) => {
    try {
        const { sessionId } = req.params;
        const { text, name, phone } = req.body;

        if (!text) {
            return res.status(400).json({ error: "text is required." });
        }

        const { botReply, chat } = await createOrAppendIncomingMessage({
            sessionId,
            text,
            name,
            phone,
        });

        return res.json({
            ok: true,
            autoReplySent: Boolean(botReply),
            botReply,
            chat,
        });
    } catch (error) {
        next(error);
    }
});

router.post("/chats/:sessionId/admin-reply", async(req, res, next) => {
    try {
        const { sessionId } = req.params;
        const { text, replyTo } = req.body;

        if (!text) {
            return res.status(400).json({ error: "text is required." });
        }

        const session = await findSessionByIdentifier(sessionId);

        if (!session) {
            return res.status(404).json({ error: "Chat session not found." });
        }

        const identity = await resolveIdentity(session);
        session.Name = identity.name;
        session.PhnNumber = identity.phone;

        normalizeSessionStatus(session);

        session.messages.push({
            type: "ai",
            source: "admin",
            data: {
                content: text,
                additional_kwargs: replyTo ? {
                    replyTo: {
                        id: replyTo.id,
                        sender: replyTo.sender,
                        text: replyTo.text,
                    },
                } : {},
                response_metadata: {
                    handledBy: "admin",
                },
            },
            createdAt: new Date(),
            deliveredToUser: true,
        });

        session.adminStatus = "ACTIVE";
        session.botStatus = session.isBotActive ? "ACTIVE" : "INACTIVE";

        await session.save({ validateBeforeSave: false });
        await safeCreateAdminLog({
            sessionId: session.sessionId,
            Name: session.Name,
            PhnNumber: session.PhnNumber,
            role: "admin",
            message: text,
        });

        const latest = await ChatSession.findById(session._id).lean();
        return res.json({ ok: true, chat: safeMapSessionToChat(latest) });
    } catch (error) {
        next(error);
    }
});

router.patch("/chats/:sessionId/bot", async(req, res, next) => {
    try {
        const { sessionId } = req.params;
        const { isBotActive } = req.body;

        if (typeof isBotActive !== "boolean") {
            return res.status(400).json({ error: "isBotActive must be boolean." });
        }

        const session = await findSessionByIdentifier(sessionId);

        if (!session) {
            return res.status(404).json({ error: "Chat session not found." });
        }

        session.isBotActive = isBotActive;
        session.botManualState = isBotActive;
        session.botStatus = isBotActive ? "ACTIVE" : "INACTIVE";
        session.adminStatus = isBotActive ? "INACTIVE" : "ACTIVE";

        if (!isBotActive) {
            const nowMs = Date.now();
            const latestBotMessage = [...session.messages]
                .reverse()
                .find((message) => message.source === "bot" && message.deliveredToUser === true);

            if (latestBotMessage) {
                const ageMs = nowMs - new Date(latestBotMessage.createdAt).getTime();
                if (ageMs <= 3000) {
                    latestBotMessage.deliveredToUser = false;
                    latestBotMessage.data.response_metadata = {
                        ...(latestBotMessage.data.response_metadata || {}),
                        suppressedAt: new Date().toISOString(),
                        suppressedReason: "manual_admin_takeover",
                    };
                }
            }
        }

        await session.save({ validateBeforeSave: false });

        const latest = await ChatSession.findById(session._id).lean();
        return res.json({ ok: true, chat: safeMapSessionToChat(latest) });
    } catch (error) {
        next(error);
    }
});

router.post("/chats/:sessionId/mark-read", async(req, res, next) => {
    try {
        const { sessionId } = req.params;

        const sessionDoc = await findSessionByIdentifier(sessionId);

        if (!sessionDoc) {
            return res.status(404).json({ error: "Chat session not found." });
        }

        sessionDoc.unread = 0;
        await sessionDoc.save({ validateBeforeSave: false });

        const latestSession = await ChatSession.findById(sessionDoc._id);
        if (!latestSession) {
            return res.status(404).json({ error: "Chat session not found." });
        }

        return res.json({ ok: true, chat: safeMapSessionToChat(latestSession.toObject()) });
    } catch (error) {
        next(error);
    }
});

export default router;
