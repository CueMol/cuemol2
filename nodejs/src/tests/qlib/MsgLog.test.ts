import { cm } from '../setup';
import type { MsgLog } from '@/wrappers/MsgLog';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('MsgLog', () => {
    let svc: MsgLog;
    let tempFiles: string[] = [];

    beforeEach(() => {
        svc = cm.getService('MsgLog') as MsgLog;
    });

    afterEach(() => {
        // Reset file redirection
        svc.setFileRedirPath('');

        // Cleanup temporary files
        tempFiles.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
        tempFiles = [];
    });

    const createTempFile = (): string => {
        const file = path.join(
            os.tmpdir(),
            `cuemol_test_${Date.now()}_${Math.random()}.txt`
        );
        tempFiles.push(file);
        return file;
    };

    it('creates service instance', () => {
        expect(svc).toBeTruthy();
    });

    describe('message accumulation', () => {
        it('stops accumulating after removeAccumMsg()', () => {
            svc.removeAccumMsg();
            svc.writeln('after removal');

            expect(svc.getAccumMsg()).toBe('');
        });

        it('clears accumulated messages when removeAccumMsg() is called', () => {
            svc.removeAccumMsg();

            expect(svc.getAccumMsg()).toBe('');
        });
    });

    describe('file redirection', () => {
        it('has no redirection path by default', () => {
            expect(svc.getFileRedirPath()).toBe('');
        });

        it('writes to file when redirection is set', () => {
            const logFile = createTempFile();

            svc.setFileRedirPath(logFile);
            svc.writeln('test output');

            const contents = fs.readFileSync(logFile, 'utf8');
            expect(contents).toContain('test output');
        });

        it('returns correct redirection path', () => {
            const logFile = createTempFile();

            svc.setFileRedirPath(logFile);

            expect(svc.getFileRedirPath()).toBe(logFile);
        });

        it('stops writing to file after redirection is cleared', () => {
            const logFile = createTempFile();

            svc.setFileRedirPath(logFile);
            svc.writeln('included');
            svc.setFileRedirPath('');
            svc.writeln('excluded');

            const contents = fs.readFileSync(logFile, 'utf8');
            expect(contents).toContain('included');
            expect(contents).not.toContain('excluded');
        });

        it('handles multiple writes to redirected file', () => {
            const logFile = createTempFile();

            svc.setFileRedirPath(logFile);
            svc.write('line1 ');
            svc.write('line2 ');
            svc.writeln('line3');

            const contents = fs.readFileSync(logFile, 'utf8');
            expect(contents).toContain('line1');
            expect(contents).toContain('line2');
            expect(contents).toContain('line3');
        });

        it('can switch redirection to a different file', () => {
            const logFile1 = createTempFile();
            const logFile2 = createTempFile();

            svc.setFileRedirPath(logFile1);
            svc.writeln('to file1');

            svc.setFileRedirPath(logFile2);
            svc.writeln('to file2');

            const contents1 = fs.readFileSync(logFile1, 'utf8');
            const contents2 = fs.readFileSync(logFile2, 'utf8');

            expect(contents1).toContain('to file1');
            expect(contents1).not.toContain('to file2');
            expect(contents2).toContain('to file2');
            expect(contents2).not.toContain('to file1');
        });
    });
});
