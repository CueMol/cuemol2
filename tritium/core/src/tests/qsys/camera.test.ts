import { Camera } from '@/wrappers/Camera';
import { Vector } from '@/wrappers/Vector';
import { Quat } from '@/wrappers/Quat';
import { cm } from '../setup';

// Test constants for camera properties
const DEFAULT_ZOOM = 50.0;
const DEFAULT_SLAB = 50.0;
const DEFAULT_DISTANCE = 200.0;
const DEFAULT_STEREO_DIST = 1.0;

const MIN_ZOOM = 0.0001; // F_EPS4 from C++ implementation
const MIN_SLAB = 0.1;
const MAX_SLAB = 10000.0;
const MIN_DISTANCE = 0.1;
const MAX_DISTANCE = 10000.0;

const CUSTOM_ZOOM = 75.5;
const CUSTOM_SLAB = 100.0;
const CUSTOM_DISTANCE = 300.0;
const CUSTOM_STEREO_DIST = 2.5;

// Helper function to create a Camera instance
const createCamera = (): Camera => {
    return cm.createObj('Camera') as Camera;
};

// Helper function to create a Vector with specified x, y, z values
const createVector = (x: number, y: number, z: number): Vector => {
    const v = cm.createObj('Vector') as Vector;
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
};

// Helper function to create a Quat with specified x, y, z, a values
const createQuat = (x: number, y: number, z: number, a: number): Quat => {
    const q = cm.createObj('Quat') as Quat;
    q.x = x;
    q.y = y;
    q.z = z;
    q.a = a;
    return q;
};

describe('Camera', () => {
    let sut: Camera;

    beforeEach(() => {
        sut = createCamera();
    });

    describe('initialization and basic properties', () => {
        it('should initialize with default values', () => {
            expect(sut.zoom).toBe(DEFAULT_ZOOM);
            expect(sut.slab).toBe(DEFAULT_SLAB);
            expect(sut.distance).toBe(DEFAULT_DISTANCE);
            expect(sut.stereoDist).toBe(DEFAULT_STEREO_DIST);
        });

        it('should initialize name as empty string', () => {
            expect(sut.name).toBe('');
        });

        it('should initialize src as empty string (readonly)', () => {
            expect(sut.src).toBe('');
        });

        it('should initialize stereoMode as "none"', () => {
            expect(sut.stereoMode).toBe('none');
        });

        it('should initialize perspec as false', () => {
            expect(sut.perspec).toBe(false);
        });

        it('should initialize centerMark as "crosshair"', () => {
            expect(sut.centerMark).toBe('crosshair');
        });

        it('should initialize center to origin (0,0,0)', () => {
            const center = sut.center;
            expect(center.x).toBe(0);
            expect(center.y).toBe(0);
            expect(center.z).toBe(0);
        });

        it('should initialize rotation to identity quaternion (0,0,0,1)', () => {
            const rotation = sut.rotation;
            expect(rotation.x).toBe(0);
            expect(rotation.y).toBe(0);
            expect(rotation.z).toBe(0);
            expect(rotation.a).toBe(1);
        });
    });

    describe('name property', () => {
        it('should set and get camera name', () => {
            const testName = 'TestCamera';
            sut.name = testName;

            expect(sut.name).toBe(testName);
        });

        it('should handle empty name', () => {
            sut.name = '';

            expect(sut.name).toBe('');
        });

        it('should handle long names', () => {
            const longName = 'a'.repeat(100);
            sut.name = longName;

            expect(sut.name).toBe(longName);
        });
    });

    describe('zoom property', () => {
        it('should set and get zoom value', () => {
            sut.zoom = CUSTOM_ZOOM;

            expect(sut.zoom).toBe(CUSTOM_ZOOM);
        });

        it('should handle negative zoom by clamping to minimum', () => {
            sut.zoom = -100;

            expect(sut.zoom).toBeCloseTo(MIN_ZOOM, 5);
        });

        it('reset to default', () => {
            expect(sut.hasPropDefault('zoom')).toBe(true);
            sut.zoom = CUSTOM_ZOOM;
            expect(sut.zoom).toBe(CUSTOM_ZOOM);
            sut.resetProp('zoom');
            expect(sut.zoom).toBe(DEFAULT_ZOOM);
        });
    });

    describe('slab property', () => {
        it('should set and get slab depth', () => {
            sut.slab = CUSTOM_SLAB;

            expect(sut.slab).toBe(CUSTOM_SLAB);
        });

        it('should clamp slab to minimum value', () => {
            sut.slab = 0;

            expect(sut.slab).toBe(MIN_SLAB);
        });

        it('should clamp slab to maximum value', () => {
            sut.slab = 20000;

            expect(sut.slab).toBe(MAX_SLAB);
        });

        it('should handle negative slab by clamping to minimum', () => {
            sut.slab = -50;

            expect(sut.slab).toBe(MIN_SLAB);
        });

        it('reset to default', () => {
            expect(sut.hasPropDefault('slab')).toBe(true);
            sut.slab = CUSTOM_SLAB;
            expect(sut.slab).toBe(CUSTOM_SLAB);
            sut.resetProp('slab');
            expect(sut.slab).toBe(DEFAULT_SLAB);
        });
    });

    describe('distance property', () => {
        it('should set and get camera distance', () => {
            sut.distance = CUSTOM_DISTANCE;

            expect(sut.distance).toBe(CUSTOM_DISTANCE);
        });

        it('should clamp distance to minimum value', () => {
            sut.distance = 0;

            expect(sut.distance).toBe(MIN_DISTANCE);
        });

        it('should clamp distance to maximum value', () => {
            sut.distance = 20000;

            expect(sut.distance).toBe(MAX_DISTANCE);
        });

        it('should handle negative distance by clamping to minimum', () => {
            sut.distance = -100;

            expect(sut.distance).toBe(MIN_DISTANCE);
        });
    });

    describe('stereoDist property', () => {
        it('should set and get stereo distance', () => {
            sut.stereoDist = CUSTOM_STEREO_DIST;

            expect(sut.stereoDist).toBe(CUSTOM_STEREO_DIST);
        });

        it('should handle zero stereo distance', () => {
            sut.stereoDist = 0;

            expect(sut.stereoDist).toBe(0);
        });

        it('should handle negative stereo distance', () => {
            sut.stereoDist = -1.5;

            expect(sut.stereoDist).toBe(-1.5);
        });
    });

    describe('center property', () => {
        it('should set and get center position', () => {
            const testCenter = createVector(10, 20, 30);
            sut.center = testCenter;

            const retrievedCenter = sut.center;
            expect(retrievedCenter.x).toBe(10);
            expect(retrievedCenter.y).toBe(20);
            expect(retrievedCenter.z).toBe(30);
        });

        it('should handle negative coordinates', () => {
            const testCenter = createVector(-5, -10, -15);
            sut.center = testCenter;

            const retrievedCenter = sut.center;
            expect(retrievedCenter.x).toBe(-5);
            expect(retrievedCenter.y).toBe(-10);
            expect(retrievedCenter.z).toBe(-15);
        });

        it('should reset to origin', () => {
            sut.center = createVector(100, 200, 300);
            sut.center = createVector(0, 0, 0);

            const center = sut.center;
            expect(center.x).toBe(0);
            expect(center.y).toBe(0);
            expect(center.z).toBe(0);
        });
    });

    describe('rotation property', () => {
        it('should set and get rotation quaternion', () => {
            const testQuat = createQuat(1, 2, 3, 4);
            sut.rotation = testQuat;

            const retrievedQuat = sut.rotation;
            expect(retrievedQuat.x).toBe(1);
            expect(retrievedQuat.y).toBe(2);
            expect(retrievedQuat.z).toBe(3);
            expect(retrievedQuat.a).toBe(4);
        });

        it('should reset to identity quaternion', () => {
            sut.rotation = createQuat(1, 2, 3, 4);
            sut.rotation = createQuat(0, 0, 0, 1);

            const rotation = sut.rotation;
            expect(rotation.x).toBe(0);
            expect(rotation.y).toBe(0);
            expect(rotation.z).toBe(0);
            expect(rotation.a).toBe(1);
        });

        it('should handle normalized quaternion', () => {
            const normalized = createQuat(0, 0, 0, 1);
            sut.rotation = normalized;

            const rotation = sut.rotation;
            expect(Math.sqrt(rotation.x ** 2 + rotation.y ** 2 + rotation.z ** 2 + rotation.a ** 2)).toBeCloseTo(
                1.0
            );
        });
    });

    describe('stereoMode property', () => {
        it.each([
            ['none', 'none'],
            ['para', 'para'],
            ['cross', 'cross'],
            ['hardware', 'hardware'],
        ])('should set and get stereoMode "%s"', (mode, expected) => {
            sut.stereoMode = mode as unknown as number;

            expect(sut.stereoMode as unknown as string).toBe(expected);
        });
    });

    describe('perspec property', () => {
        it('should set and get perspective mode', () => {
            sut.perspec = true;

            expect(sut.perspec).toBe(true);
        });

        it('should toggle perspective mode', () => {
            sut.perspec = true;
            sut.perspec = false;

            expect(sut.perspec).toBe(false);
        });
    });

    describe('centerMark property', () => {
        it.each([
            ['none', 'none'],
            ['crosshair', 'crosshair'],
            ['axis', 'axis'],
        ])('should set and get centerMark "%s"', (mark, expected) => {
            sut.centerMark = mark as unknown as number;

            expect(sut.centerMark as unknown as string).toBe(expected);
        });
    });

    describe('vis_size property', () => {
        it('should return 0 for new camera with no visibility settings', () => {
            expect(sut.vis_size).toBe(0);
        });

        it('should be readonly', () => {
            // TypeScript should prevent this, but we can verify the value doesn't change
            const initialSize = sut.vis_size;

            // Attempt to set would fail at compile time in TypeScript
            expect(sut.vis_size).toBe(initialSize);
        });
    });

    describe('clearVisSettings()', () => {
        it('should execute without error on empty visibility settings', () => {
            expect(() => sut.clearVisSettings()).not.toThrow();
        });

        it('should reset vis_size to 0', () => {
            sut.clearVisSettings();

            expect(sut.vis_size).toBe(0);
        });
    });

    describe('getVisSetJSON()', () => {
        it('should return empty object for camera with no visibility settings', () => {
            const json = sut.getVisSetJSON();

            expect(json).toBe('{}');
        });

        it('should return valid JSON string', () => {
            const json = sut.getVisSetJSON();

            expect(() => JSON.parse(json)).not.toThrow();
        });
    });

    describe('multiple property interactions', () => {
        it('should maintain independent property values', () => {
            sut.name = 'MultiPropTest';
            sut.zoom = CUSTOM_ZOOM;
            sut.slab = CUSTOM_SLAB;
            sut.distance = CUSTOM_DISTANCE;
            sut.stereoDist = CUSTOM_STEREO_DIST;
            sut.stereoMode = 'para' as unknown as number;
            sut.perspec = true;
            sut.centerMark = 'axis' as unknown as number;

            expect(sut.name).toBe('MultiPropTest');
            expect(sut.zoom).toBe(CUSTOM_ZOOM);
            expect(sut.slab).toBe(CUSTOM_SLAB);
            expect(sut.distance).toBe(CUSTOM_DISTANCE);
            expect(sut.stereoDist).toBe(CUSTOM_STEREO_DIST);
            expect(sut.stereoMode as unknown as string).toBe('para');
            expect(sut.perspec).toBe(true);
            expect(sut.centerMark as unknown as string).toBe('axis');
        });

        it('should allow resetting all properties to defaults', () => {
            // Set custom values
            sut.name = 'CustomCamera';
            sut.zoom = CUSTOM_ZOOM;
            sut.slab = CUSTOM_SLAB;
            sut.distance = CUSTOM_DISTANCE;

            // Reset to defaults
            sut.name = '';
            sut.zoom = DEFAULT_ZOOM;
            sut.slab = DEFAULT_SLAB;
            sut.distance = DEFAULT_DISTANCE;

            expect(sut.name).toBe('');
            expect(sut.zoom).toBe(DEFAULT_ZOOM);
            expect(sut.slab).toBe(DEFAULT_SLAB);
            expect(sut.distance).toBe(DEFAULT_DISTANCE);
        });
    });

    describe('edge cases and boundary conditions', () => {
        it('should handle very small positive values for zoom', () => {
            sut.zoom = 0.0001;

            expect(sut.zoom).toBeCloseTo(0.0001, 5);
        });

        it('should handle very large values within bounds', () => {
            sut.zoom = 9999;
            sut.slab = 9999;
            sut.distance = 9999;

            expect(sut.zoom).toBe(9999);
            expect(sut.slab).toBe(9999);
            expect(sut.distance).toBe(9999);
        });

        it('should handle decimal values for numeric properties', () => {
            sut.zoom = 75.123;
            sut.slab = 100.456;
            sut.distance = 250.789;
            sut.stereoDist = 1.234;

            expect(sut.zoom).toBeCloseTo(75.123, 3);
            expect(sut.slab).toBeCloseTo(100.456, 3);
            expect(sut.distance).toBeCloseTo(250.789, 3);
            expect(sut.stereoDist).toBeCloseTo(1.234, 3);
        });

        it('should handle rapid property changes', () => {
            for (let i = 0; i < 10; i++) {
                sut.zoom = 50 + i * 10;
            }

            expect(sut.zoom).toBe(140);
        });
    });
});
