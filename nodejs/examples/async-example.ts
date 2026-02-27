import { createCueMol } from '../src/async/index';
import { Vector } from '../src/wrappers/Vector';
import { Matrix } from '../src/wrappers/Matrix';

async function main(cm: any) : Promise<void> {
    console.log('main function called');
    const v1 = await cm.createObj('Vector') as Vector;
    console.log('created v1:', v1);
    // console.log('v1.wrapped.getObj():', v1.wrapped.getObj());
    await v1.set4(1, 2, 3, 0);
    v1.x = 123.45;

    console.log('==========');

    const v2 = await cm.createObj('Vector') as any;
    await v2.set4(3, 2, 1, 0);

    console.log('getprop.x:',
                await v1.get_x(),
                await v1.y,
                await v1.z,
                await v1.w);

    console.log('***** angle:', await v1.angle(v2));
    let result: any = null;
    try {
        result = await v1.add(v2);
    } catch (e) {
        console.log('Error during v1.add(v2):', e);
    }
    console.log('result:', result);

    console.log('***** result:', await result.toString());
}

const cm = createCueMol();
console.log('created worker');
await cm.initCueMol();

await main(cm)

const vec = async (x: number, y: number, z: number, w?: number): Promise<Vector> => {
    const v = await cm.createObj('Vector') as Vector;
    w !== undefined ? v.set4(x, y, z, w) : v.set3(x, y, z);
    return v;
};

async function matrix_example() {
    const mat = await cm.createObj('Matrix') as Matrix;
    const v1 = await vec(1, 0, 0);
    const v2 = await vec(0, 1, 0);
    await mat.setRotate(v1, v2, 45);
    console.log('created matrix obj:', await mat.toString());
}

await matrix_example();

cm.terminateWorker();
