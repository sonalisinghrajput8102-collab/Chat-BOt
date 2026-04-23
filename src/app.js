import express from "express";
import cors from "cors";
import morgan from "morgan";
import chatRoutes from "./routes/chatRoutes.js";

const allowedOrigins = [
    "http://localhost:5173",
    "https://chat-bot-frontend-bice.vercel.app"
];

export function createApp() {
    const app = express();

    app.use(
        cors({
            origin: (origin, callback) => {
                // allow requests with no origin (like Postman, mobile apps)
                if (!origin) return callback(null, true);

                if (allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }

                return callback(new Error("CORS blocked for this origin"));
            },
            credentials: true,
        })
    );

    app.use(express.json({ limit: "1mb" }));
    app.use(morgan("dev"));

    app.use("/api", chatRoutes);

    app.use((err, _req, res, _next) => {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    });

    return app;
}