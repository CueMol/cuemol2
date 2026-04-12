/**
 * Shared test data for GFX color tests
 * Contains common test cases used across multiple test files
 */

// ============================================================================
// Color Syntax Test Cases
// ============================================================================

/**
 * Test case format: [color_string, should_succeed]
 */
export type ColorSyntaxTestCase = [string, boolean];

/**
 * Named colors test cases (HTML standard color names)
 */
export const NAMED_COLORS: ColorSyntaxTestCase[] = [
    ['red', true],
    ['color_1', true],          // Underscore and number
    [' red', true],             // Whitespace
    ['color space', false],     // Invalid space
    ['red blue', false],        // Multiple tokens
];

/**
 * HTML hex color test cases
 */
export const HTML_COLORS: ColorSyntaxTestCase[] = [
    ['#fff', true],
    ['#ffffff', true],
    ['#AbC', true],             // Case variation
    ['#ggg', false],            // Invalid hex
];

/**
 * RGB/RGBA color syntax test cases
 * Note: CueMol's rgb()/rgba() uses normalized values (0.0-1.0), not 0-255
 */
export const RGB_COLORS: ColorSyntaxTestCase[] = [
    ['rgb(1.0, 0.0, 0.0)', true],       // Red
    ['rgb(1.0, 0.5, 0.0)', true],       // Orange
    ['RGB(0.5, 0.5, 0.5)', true],       // Uppercase (gray)
    ['rgba(1.0, 0.0, 0.0, 0.5)', true], // Red with alpha
    ['rgb(0.0, 1.0, 0.0)', true],       // Green
    ['rgb(1.0, 0.0)', false],           // Wrong arg count
    ['rgb(1.0; 0.0; 0.0)', false],      // Wrong separator
];

/**
 * HSB/HSBA color syntax test cases
 */
export const HSB_COLORS: ColorSyntaxTestCase[] = [
    ['hsb(0.0, 1.0, 1.0)', true],
    ['HSB(120.0, 0.5, 0.5)', true],     // Uppercase
    ['hsba(240.0, 1.0, 1.0, 0.5)', true],
    ['hsb(0.0, 1.0)', false],           // Wrong arg count
];

/**
 * MolColorRef ($molcol) test cases
 */
export const MOLCOL_COLORS: ColorSyntaxTestCase[] = [
    ['$molcol', true],
    ['$mol col', false],                // Space
];

/**
 * Color modifier syntax test cases
 */
export const MODIFIERS: ColorSyntaxTestCase[] = [
    ['red{alpha: 0.5}', true],
    ['rgb(1.0, 0.0, 0.0){alpha: 0.5; brightness: 1.2}', true],
    ['red{alpha: 0.5', false],          // Missing brace
];

/**
 * Edge case test cases
 */
export const EDGE_CASES: ColorSyntaxTestCase[] = [
    ['', false],
    ['   ', false],
    ['Rgb(1.0, 0.0, 0.0)', false],      // Mixed case keyword
];

/**
 * All syntax test cases combined
 */
export const ALL_SYNTAX_CASES: ColorSyntaxTestCase[] = [
    ...NAMED_COLORS,
    ...HTML_COLORS,
    ...RGB_COLORS,
    ...HSB_COLORS,
    ...MOLCOL_COLORS,
    ...MODIFIERS,
    ...EDGE_CASES,
];

// ============================================================================
// Helper Functions for Test Data
// ============================================================================

/**
 * Filter test cases by expected success/failure
 */
export const filterValidCases = (cases: ColorSyntaxTestCase[]): string[] =>
    cases.filter(([_, shouldSucceed]) => shouldSucceed).map(([str]) => str);

/**
 * Filter test cases by expected failure
 */
export const filterInvalidCases = (cases: ColorSyntaxTestCase[]): string[] =>
    cases.filter(([_, shouldSucceed]) => !shouldSucceed).map(([str]) => str);
