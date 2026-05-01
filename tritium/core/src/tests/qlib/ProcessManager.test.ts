import { cm } from '../setup';
import type { ProcessManager } from '@/wrappers/ProcessManager';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Node executable path (cross-platform)
const NODE_EXE = process.execPath;

// Path to helper scripts
const HELPERS_DIR = path.join(__dirname, '..', 'helpers');
const SLEEP_HELPER = path.join(HELPERS_DIR, 'sleep.js');
const LIST_HELPER = path.join(HELPERS_DIR, 'ls.js');

// Task status constants
const TaskStatus = {
    RUNNING: 1,
    ENDED: 2,
} as const;

describe('ProcessManager', () => {
    let svc: ProcessManager;
    let tmpDir: string | null = null;

    beforeEach(() => {
        svc = cm.getService('ProcessManager') as ProcessManager;
    });

    afterEach(() => {
        // Cleanup temporary directories created during tests
        if (tmpDir && fs.existsSync(tmpDir)) {
            cleanupTempDir(tmpDir);
            tmpDir = null;
        }
    });

    /** Helper: Create a temporary directory for test artifacts */
    const createTempDir = (): string => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-test-'));
        return tmpDir;
    };

    /** Helper: Recursively remove directory and contents */
    const cleanupTempDir = (dir: string): void => {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            files.forEach((file) => {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    cleanupTempDir(filePath);
                } else {
                    fs.unlinkSync(filePath);
                }
            });
            fs.rmdirSync(dir);
        }
    };

    describe('initialization', () => {
        it('starts with empty queue and no error messages', () => {
            expect(svc.queue_len).toBe(0);
            expect(svc.errormsg).toBe('');
        });
    });

    describe('slot configuration', () => {
        it('allows setting and retrieving slot size', () => {
            const slotSize = 10;
            svc.setSlotSize(slotSize);
            expect(svc.getSlotSize()).toBe(slotSize);
        });
    });

    describe('task lifecycle', () => {
        it('transitions from RUNNING to ENDED state', () => {
            const taskId = svc.queueTask(NODE_EXE, `${SLEEP_HELPER} 1`, '');

            expect(svc.isAlive(taskId)).toBe(true);
            expect(svc.getTaskStatus(taskId)).toBe(TaskStatus.RUNNING);

            svc.waitForExit(taskId);

            expect(svc.getTaskStatus(taskId)).toBe(TaskStatus.ENDED);
        });

        it('assigns unique IDs to queued tasks', () => {
            const taskId1 = svc.queueTask(NODE_EXE, `${SLEEP_HELPER} 0.1`, '');
            const taskId2 = svc.queueTask(NODE_EXE, `${SLEEP_HELPER} 0.1`, '');

            expect(taskId1).not.toBe(taskId2);

            // Cleanup
            svc.waitForExit(taskId1);
            svc.waitForExit(taskId2);
        });

        it('includes completed tasks in done task list', () => {
            const taskId = svc.queueTask(NODE_EXE, `${SLEEP_HELPER} 1`, '');
            svc.waitForExit(taskId);

            const doneList = svc.doneTaskListJSON();
            expect(doneList).toBeTruthy();
            expect(doneList.length).toBeGreaterThan(0);
        });
    });

    describe('concurrent task management', () => {
        it('respects slot limit and queues excess tasks', () => {
            svc.setSlotSize(1);

            const task1 = svc.queueTask(NODE_EXE, `${SLEEP_HELPER} 1`, '');
            const task2 = svc.queueTask(NODE_EXE, `${SLEEP_HELPER} 1`, '');

            expect(svc.getTaskStatus(task1)).toBe(TaskStatus.RUNNING);
            expect(svc.queue_len).toBeGreaterThan(0);

            // Cleanup
            svc.waitForExit(task1);
            svc.waitForExit(task2);
        });

        it('allows killing a running task', () => {
            svc.setSlotSize(1);
            const task1 = svc.queueTask(NODE_EXE, `${SLEEP_HELPER} 1000`, '');
            const task2 = svc.queueTask(NODE_EXE, `${SLEEP_HELPER} 1`, '');

            expect(svc.getTaskStatus(task1)).toBe(TaskStatus.RUNNING);

            svc.kill(task1);
            expect(svc.getTaskStatus(task1)).toBe(TaskStatus.ENDED);

            svc.waitForExit(task2);
            expect(svc.getTaskStatus(task2)).toBe(TaskStatus.ENDED);
        });
    });

    describe('output logging', () => {
        it('captures task output in memory', () => {
            const taskId = svc.queueTask(NODE_EXE, `${LIST_HELPER} -la`, '');
            svc.waitForExit(taskId);

            const output = svc.getResultOutput(taskId);
            expect(output).toBeTruthy();
            expect(output.length).toBeGreaterThan(0);
        });

        it('writes task output to log file when path is set', () => {
            const testDir = createTempDir();
            const logFile = path.join(testDir, 'process.log');
            svc.setLogPath(logFile);

            const taskId = svc.queueTask(NODE_EXE, `${LIST_HELPER} -la`, '');
            svc.waitForExit(taskId);

            // Verify output captured in memory
            const memoryOutput = svc.getResultOutput(taskId);
            expect(memoryOutput.length).toBeGreaterThan(0);

            // Verify output written to file
            expect(fs.existsSync(logFile)).toBe(true);
            const fileContent = fs.readFileSync(logFile, 'utf8');
            expect(fileContent.length).toBeGreaterThan(0);
        });
    });
});
