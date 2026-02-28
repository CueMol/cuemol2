import { Vector } from '@/wrappers/Vector';
import { MsgLog } from '@/wrappers/MsgLog';
import * as core from '@/async/index';

export const cm = core.createCueMol();

describe('Basic function of async wrapper', () => {
    // let sut: Vector;

    // beforeEach(async () => {
    //     sut = await cm.createObj('Vector') as Vector;
    // });

    describe('create object', () => {
        it('create vector object', async () => {
            const v = await cm.createObj('Vector') as Vector;
            expect(v).toBeInstanceOf(Vector);
        });
        it('Fail to create unknown object', async () => {
            const v = await cm.createObj('unknown');
            expect(v).toBeNull();
        });
    });

    describe('getService test', () => {
        it('get msglog service', async () => {
            const v = await cm.getService('MsgLog') as MsgLog;
            expect(v).toBeInstanceOf(MsgLog);
        });
        it('Fail to get unknown service', async () => {
            const v = await cm.getService('unknown');
            expect(v).toBeNull();
        });
        it('Fail to get vector as service', async () => {
            const v = await cm.getService('Vector') as Vector;
            expect(v).toBeNull();
        });
        // it('Fail to create new msglog obj', async () => {
        //     const v = await cm.createObj('MsgLog') as MsgLog;
        //     expect(v).toBeNull();
        // });
    });

    describe('hasClass test', () => {
        it('hasClass(vector) returns true', async () => {
            const v = await cm.hasClass('Vector');
            expect(v).toBe(true);
        });

        it('hasClass(unknown) returns true', async () => {
            const v = await cm.hasClass('unknown');
            expect(v).toBe(false);
        });
    });

    describe('getAllClassNamesJSON test', () => {
        it('getAllClassNamesJSON returns JSON string', async () => {
            const jsonStr = await cm.getAllClassNamesJSON();
            expect(typeof jsonStr).toBe('string');
            const classNames = JSON.parse(jsonStr as string);
            expect(Array.isArray(classNames)).toBe(true);
            expect(classNames).toContain('Vector');
            expect(classNames).toContain('MsgLog');
        });
    });
});


afterAll(() => {
    cm.terminateWorker();
});

