// logger.ts
import pino, { type Logger } from "pino";

const isBrowser = typeof window !== 'undefined';
// const isBrowser = false;

function resolveModule(id: string): string {
    if (id.startsWith("file://")) {
        id = new URL(id).pathname;
    }
    const base = id.split('/').pop() ?? id;
    return base.replace(/\.[^.]+$/, '');
}

export function createLogger(importMetaUrl: string): Logger {
    const mod = resolveModule(importMetaUrl);

    const base: pino.LoggerOptions = {
        level: (!isBrowser && process.env.LOG_LEVEL) || "info",
        base: { module: mod },
        timestamp: pino.stdTimeFunctions.isoTime,
    };

    // if (isBrowser) return pino(base);

    let isTTY = false;
    let JSON_MODE = false;
    if (!isBrowser){
        isTTY = process.stdout.isTTY === true;
        JSON_MODE = process.env.LOG_FORMAT === "json";
    }
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
