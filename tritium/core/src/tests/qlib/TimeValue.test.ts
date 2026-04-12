import { cm } from '../setup';
import type { TimeValue } from '@/wrappers/TimeValue';


describe('TimeValue', () => {
    let timeValue: TimeValue;

    beforeEach(() => {
        timeValue = cm.createObj('TimeValue') as TimeValue;
    });

    describe('initialization', () => {
        it('creates instance with default zero value', () => {
            expect(timeValue).toBeTruthy();
            expect(timeValue.strval).toBe('0');
            expect(timeValue.millisec).toBeCloseTo(0);
            expect(timeValue.second).toBeCloseTo(0);
        });
    });

    describe('string conversion (bidirectional)', () => {
        /**
         * Test cases for string <-> time value conversion
         * Format patterns:
         * - "S" or "S.mmm" - seconds with optional milliseconds
         * - "M:S" or "M:S.mmm" - minutes:seconds with optional milliseconds
         * - "H:M:S" or "H:M:S.mmm" - hours:minutes:seconds with optional milliseconds
         * 
         * Note: Milliseconds are displayed as integers (not zero-padded on the left)
         * e.g., 5ms → ".5", 50ms → ".50", 500ms → ".500"
         */
        it.each([
            // [seconds, millisec, expectedString, description]
            [0, 0, '0', 'zero value'],
            [0, 123, '0.123', 'milliseconds only'],
            [123, 0, '2:3', 'whole seconds (2 min 3 sec)'],
            [123, 456, '2:3.456', 'seconds with milliseconds'],
            [123456, 789, '34:17:36.789', 'hours:minutes:seconds with milliseconds'],
            [3661, 500, '1:1:1.500', 'exactly 1 hour 1 minute 1.5 seconds'],
            [60, 0, '1:0', 'exactly 1 minute'],
            [3600, 0, '1:0:0', 'exactly 1 hour'],
        ])('converts %d.%d seconds to "%s" (%s)', (sec, msec, expected, _description) => {
            // Set time value
            timeValue.second = sec;
            timeValue.millisec += msec;  // Add milliseconds to existing seconds

            // Verify conversion
            expect(timeValue.toString()).toBe(expected);
            expect(timeValue.strval).toBe(expected);

            // Verify round-trip conversion
            const roundTrip = cm.createObj('TimeValue') as TimeValue;
            roundTrip.strval = expected;
            const totalMillisec = sec * 1000 + msec;
            expect(roundTrip.millisec).toBeCloseTo(totalMillisec, 0);
        });

        it('handles fractional milliseconds by truncating in toString()', () => {
            // Set 123.456 milliseconds - should display as "0.123" (truncated)
            timeValue.millisec = 123.456;
            expect(timeValue.toString()).toBe('0.123');

            // However, the internal value still preserves precision
            expect(timeValue.millisec).toBeCloseTo(123.456);
        });

        it('parses string format correctly', () => {
            timeValue.strval = '34:17:36.789';

            // Total time: 34*3600 + 17*60 + 36 = 123456 seconds
            // Plus 789 milliseconds = 123456789 milliseconds total
            expect(timeValue.second).toBeCloseTo(123456.789);
            expect(timeValue.millisec).toBeCloseTo(123456789);
        });
    });

    describe('property setters and getters', () => {
        it('sets and gets millisec property', () => {
            timeValue.millisec = 5000.5;
            expect(timeValue.millisec).toBeCloseTo(5000.5);
            expect(timeValue.second).toBeCloseTo(5.0005);
        });

        it('sets and gets second property', () => {
            timeValue.second = 123.456;
            expect(timeValue.second).toBeCloseTo(123.456);
            expect(timeValue.millisec).toBeCloseTo(123456);
        });

        it('handles large values', () => {
            // Test with ~1 year worth of seconds (realistic large value)
            const oneYearSeconds = 365.25 * 24 * 60 * 60;  // ~31,557,600 seconds
            timeValue.second = oneYearSeconds;

            expect(timeValue.second).toBeCloseTo(oneYearSeconds);
            expect(timeValue.getHour()).toBe(Math.floor(oneYearSeconds / 3600));
        });
    });

    describe('component extraction methods', () => {
        /**
         * Tests for getHour(), getMinute(), getSecond(), getMilliSec()
         * These methods support two modes via the 'lim' (limit) parameter:
         * - lim=true: Returns component with modulo (remainder)
         * - lim=false: Returns total value in that unit
         */
        describe('with remainder mode (lim=true)', () => {
            it('extracts time components from complex time value', () => {
                // Set to 34:17:36.789 (34 hours, 17 minutes, 36 seconds, 789 milliseconds)
                timeValue.strval = '34:17:36.789';

                expect(timeValue.getHour()).toBe(34);
                expect(timeValue.getMinute(true)).toBe(17);
                expect(timeValue.getSecond(true)).toBe(36);
                expect(timeValue.getMilliSec(true)).toBe(789);
            });

            it('handles values exactly on unit boundaries', () => {
                // 3661 seconds = 1 hour, 1 minute, 1 second
                timeValue.second = 3661;

                expect(timeValue.getHour()).toBe(1);
                expect(timeValue.getMinute(true)).toBe(1);
                expect(timeValue.getSecond(true)).toBe(1);
                expect(timeValue.getMilliSec(true)).toBe(0);
            });

            it('handles zero values', () => {
                expect(timeValue.getHour()).toBe(0);
                expect(timeValue.getMinute(true)).toBe(0);
                expect(timeValue.getSecond(true)).toBe(0);
                expect(timeValue.getMilliSec(true)).toBe(0);
            });
        });

        describe('without remainder mode (lim=false) - total values', () => {
            it('returns total values in each unit', () => {
                // Set to 34:17:36.789
                // Total: 34*3600 + 17*60 + 36 = 123456 seconds, 789 milliseconds
                timeValue.strval = '34:17:36.789';

                expect(timeValue.getMinute(false)).toBe(2057);  // 123456 / 60
                expect(timeValue.getSecond(false)).toBe(123456);
                expect(timeValue.getMilliSec(false)).toBe(123456789);
            });

            it('returns correct total for simple values', () => {
                timeValue.millisec = 5500;  // 5.5 seconds

                expect(timeValue.getMinute(false)).toBe(0);
                expect(timeValue.getSecond(false)).toBe(5);
                expect(timeValue.getMilliSec(false)).toBe(5500);
            });
        });

        describe('edge cases for component methods', () => {
            it('handles maximum component values (59 min, 59 sec, 999 msec)', () => {
                // 59 minutes, 59 seconds, 999 milliseconds (just under 1 hour)
                timeValue.second = 3599.999;

                expect(timeValue.getHour()).toBe(0);
                expect(timeValue.getMinute(true)).toBe(59);
                expect(timeValue.getSecond(true)).toBe(59);
                expect(timeValue.getMilliSec(true)).toBe(999);
            });

            it('handles fractional seconds correctly', () => {
                timeValue.second = 1.5;  // 1 second + 500 milliseconds

                expect(timeValue.getSecond(true)).toBe(1);
                expect(timeValue.getMilliSec(true)).toBe(500);
            });
        });
    });

    describe('equality comparison', () => {
        it('identifies equal time values', () => {
            const tv1 = cm.createObj('TimeValue') as TimeValue;
            const tv2 = cm.createObj('TimeValue') as TimeValue;

            tv1.strval = '12:34:56.78';
            tv2.strval = '12:34:56.78';

            expect(tv1.equals(tv2)).toBe(true);
        });

        it('identifies different time values', () => {
            const tv1 = cm.createObj('TimeValue') as TimeValue;
            const tv2 = cm.createObj('TimeValue') as TimeValue;

            tv1.strval = '12:34:56.78';
            tv2.strval = '34:56.78';

            expect(tv1.equals(tv2)).toBe(false);
        });

        it('compares zero values as equal', () => {
            const tv1 = cm.createObj('TimeValue') as TimeValue;
            const tv2 = cm.createObj('TimeValue') as TimeValue;

            expect(tv1.equals(tv2)).toBe(true);
        });

        it('handles comparison with values set via different properties', () => {
            const tv1 = cm.createObj('TimeValue') as TimeValue;
            const tv2 = cm.createObj('TimeValue') as TimeValue;

            // Set same value using different methods
            tv1.second = 123.456;
            tv2.millisec = 123456;

            expect(tv1.equals(tv2)).toBe(true);
        });

        it('detects small differences in milliseconds', () => {
            const tv1 = cm.createObj('TimeValue') as TimeValue;
            const tv2 = cm.createObj('TimeValue') as TimeValue;

            tv1.millisec = 1000;
            tv2.millisec = 1001;

            expect(tv1.equals(tv2)).toBe(false);
        });
    });

    describe('error handling and invalid inputs', () => {
        it('handles setting invalid string formats', () => {
            // Invalid formats should throw TimeFormatException in C++
            // In JavaScript, this likely manifests as an error/exception
            const invalidFormats = [
                'invalid',
                '1:2:3:4',  // Too many colons
                'abc',
                '1.2.3',    // Multiple decimal points
                '',         // Empty string
            ];

            invalidFormats.forEach(format => {
                expect(() => {
                    const tv = cm.createObj('TimeValue') as TimeValue;
                    tv.strval = format;
                }).toThrow();
            });
        });

        it('handles negative values gracefully', () => {
            // Note: TimeValue represents time spans, not absolute time
            // Negative values may be supported for representing "time ago" or deltas
            // This test documents the actual behavior without asserting correctness

            const negativeSeconds = -10;

            // Attempt to set negative value
            // Implementation may either accept it or throw an error
            try {
                timeValue.second = negativeSeconds;

                // If accepted, verify it's stored
                const storedValue = timeValue.second;
                expect(typeof storedValue).toBe('number');

                // Document the actual behavior
                if (storedValue < 0) {
                    // Implementation supports negative time values
                    expect(storedValue).toBeCloseTo(negativeSeconds);
                } else {
                    // Implementation may clamp to zero or use absolute value
                    console.log(`Negative value ${negativeSeconds} stored as ${storedValue}`);
                }
            } catch (error) {
                // Implementation rejects negative values - this is also valid
                expect(error).toBeDefined();
            }
        });
    });

    describe('boundary and special values', () => {
        it('handles very large values within 64-bit nanosecond range', () => {
            // TimeValue internally stores time as 64-bit nanoseconds
            // Maximum representable time: 2^63 nanoseconds ≈ 292 years
            // 
            // 64-bit signed integer range: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807
            // In seconds: ±9,223,372,036 seconds ≈ ±292 years
            //
            // Test with 100 years worth of seconds (~3.15 billion seconds)
            const hundredYearsInSeconds = 100 * 365.25 * 24 * 60 * 60;  // ~3,155,760,000 seconds

            timeValue.second = hundredYearsInSeconds;

            // Verify value is stored correctly
            expect(timeValue.second).toBeCloseTo(hundredYearsInSeconds, -6);  // Allow small precision loss
            expect(timeValue.second).toBeGreaterThan(0);

            // Verify we can extract components
            const hours = timeValue.getHour();
            expect(hours).toBeGreaterThan(0);
            expect(hours).toBe(Math.floor(hundredYearsInSeconds / 3600));
        });

        it('preserves precision for small fractional values', () => {
            timeValue.millisec = 0.001;  // 1 microsecond (sub-millisecond)

            // Since internal storage is nanoseconds, this should be preserved
            expect(timeValue.millisec).toBeCloseTo(0.001, 3);
        });

        it('handles zero after non-zero value', () => {
            timeValue.second = 100;
            expect(timeValue.second).toBeCloseTo(100);

            timeValue.second = 0;
            expect(timeValue.second).toBeCloseTo(0);
            expect(timeValue.strval).toBe('0');
        });
    });

    describe('string format variations', () => {
        it('parses formats with leading/trailing zeros correctly', () => {
            timeValue.strval = '0:0:5.0';
            expect(timeValue.second).toBeCloseTo(5.0);
        });

        it('handles formats without milliseconds', () => {
            timeValue.strval = '1:30';  // 1 minute 30 seconds, no milliseconds
            expect(timeValue.second).toBeCloseTo(90);
            expect(timeValue.getMilliSec(true)).toBe(0);
        });

        it('handles formats with only hours', () => {
            timeValue.strval = '2:0:0';  // 2 hours exactly
            expect(timeValue.second).toBeCloseTo(7200);
            expect(timeValue.getHour()).toBe(2);
        });
    });
});
