import dotenv from "dotenv";
import http from "node:http";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { ensureBotTemplates } from "./services/bootstrapService.js";


dotenv.config();

const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI;
const MAX_PORT_ATTEMPTS = 10;

function listenWithFallback(app, preferredPort) {
    return new Promise((resolve, reject) => {
        let attempt = 0;

        const tryListen = () => {
            const port = preferredPort + attempt;
            const server = http.createServer(app);

            server.once("error", (error) => {
                if (error.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
                    attempt += 1;
                    console.warn(`Port ${port} is busy. Trying ${preferredPort + attempt}...`);
                    return tryListen();
                }
                reject(error);
            });

            server.once("listening", () => {
                resolve({ server, port });
            });

            server.listen(port);
        };

        tryListen();
    });
}

async function bootstrap() {
    await connectDatabase(MONGODB_URI);
    await ensureBotTemplates();

    const app = createApp();
    const { port } = await listenWithFallback(app, PORT);
    console.log(`Backend server running on http://localhost:${port}`);
}

bootstrap().catch((error) => {
    console.error("Failed to start backend:", error);
    process.exit(1);
});