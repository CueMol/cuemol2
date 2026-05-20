import type { CueMol } from '@cuemol/core/src/cuemol';
import type { TextImgBuf } from '@cuemol/core/src/wrappers/TextImgBuf';
import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';

/**
 * Rasterise a C++ TextRender request onto an OffscreenCanvas and write the
 * resulting alpha bitmap back into the native object.
 *
 * Runs synchronously in the Worker thread: the native TextRender object
 * cannot be transferred via postMessage, so 2D text rasterisation happens
 * here. Invoked from the `renderText` event listener registered by
 * `registerWorkerEventListener` (workerLifecycle.ts).
 */
export function renderText(cm: CueMol, trNative: any): void {
    const tr = cm.createWrapper(trNative) as TextImgBuf;
    const text: string = tr.text;
    const fontstr: string = tr.font;
    const h: number = tr.height;

    // Measure text width using a temporary OffscreenCanvas
    const tmpCanvas = new OffscreenCanvas(1, 1);
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.font = fontstr;
    const metrics = tmpCtx.measureText(text);
    let w = Math.ceil(metrics.width);
    // Align to 4-byte boundary (same as cuemol2 reference implementation)
    if (w % 4 !== 0) w += (4 - w % 4);

    // Render text onto a properly-sized OffscreenCanvas
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.font = fontstr;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'white';
    ctx.fillText(text, 0, h);

    // Extract alpha channel values and write back to the native C++ TextRender object
    const img = ctx.getImageData(0, 0, w, h);
    const size = w * h;

    tr.width = w;
    tr.resize(size);

    // Wrap img.data (Uint8ClampedArray, RGBA) as a Uint8Array view (zero-copy),
    // then pass to C++ as a ByteArray for bulk alpha extraction — avoids N JS→C++ calls.
    const rgbaView = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    const ba = cm.fromTypedArray(rgbaView) as ByteArray;
    tr.setDataFromRGBA(ba);
}
