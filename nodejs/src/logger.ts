// logger.ts
import pino, { type Logger } from "pino";
import path from "node:path";

const isTTY = process.stdout.isTTY === true;
const JSON_MODE = process.env.LOG_FORMAT === "json";

function resolveModule(id: string): string {
    if (id.startsWith("file://")) {
        id = new URL(id).pathname;
    }
    return path.basename(id, path.extname(id));
}

export function createLogger(importMetaUrl: string): Logger {
    const mod = resolveModule(importMetaUrl);

    const base: pino.LoggerOptions = {
        level: process.env.LOG_LEVEL || "info",
        base: { module: mod },
        timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (JSON_MODE) return pino(base);

    return pino({
        ...base,
        transport: {
            target: "pino-pretty",
            options: {
                colorize: isTTY,
                ignore: "pid,hostname,module",
                translateTime: "yyyy-mm-dd HH:MM:ss.l",
                messageFormat: "[{module}] {msg}",
                singleLine: true,
            },
        },
    });
}
