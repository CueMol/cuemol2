import { describe, it, expect } from 'vitest'
import { applyLogFilter, parseFilter } from '../utils/logFilter'

describe('parseFilter', () => {
  it('splits whitespace and routes tokens into include / exclude', () => {
    expect(parseFilter('info worker !debug !trace')).toEqual({
      include: ['info', 'worker'],
      exclude: ['debug', 'trace'],
    })
  })

  it('lower-cases tokens for case-insensitive match', () => {
    expect(parseFilter('Info !Warn')).toEqual({
      include: ['info'],
      exclude: ['warn'],
    })
  })

  it('ignores empty and bare-! tokens', () => {
    expect(parseFilter('  foo   !  ! bar ')).toEqual({
      include: ['foo', 'bar'],
      exclude: [],
    })
  })

  it('returns empty arrays for an empty filter', () => {
    expect(parseFilter('')).toEqual({ include: [], exclude: [] })
    expect(parseFilter('   ')).toEqual({ include: [], exclude: [] })
  })
})

describe('applyLogFilter', () => {
  const sample =
    'INFO worker started\n' +
    'WARN worker slow\n' +
    'INFO scene loaded\n' +
    'ERROR loader failed\n'

  it('returns the input unchanged for an empty filter', () => {
    expect(applyLogFilter(sample, '')).toBe(sample)
    expect(applyLogFilter(sample, '   ')).toBe(sample)
  })

  it('keeps only lines containing every include token', () => {
    expect(applyLogFilter(sample, 'info worker')).toBe('INFO worker started\n')
  })

  it('excludes lines that contain any exclude token', () => {
    expect(applyLogFilter(sample, '!worker')).toBe(
      'INFO scene loaded\nERROR loader failed\n',
    )
  })

  it('combines include and exclude in the same query', () => {
    expect(applyLogFilter(sample, 'info !worker')).toBe('INFO scene loaded\n')
  })

  it('matches case-insensitively', () => {
    expect(applyLogFilter(sample, 'ERROR')).toBe('ERROR loader failed\n')
    expect(applyLogFilter(sample, 'error')).toBe('ERROR loader failed\n')
  })

  it('preserves trailing newline when input has one and drops it when not', () => {
    const noNl = 'a foo\nb bar'
    expect(applyLogFilter(noNl, 'foo')).toBe('a foo')
    expect(applyLogFilter(noNl + '\n', 'foo')).toBe('a foo\n')
  })

  it('returns empty string when no line matches', () => {
    expect(applyLogFilter(sample, 'nothing-matches')).toBe('')
  })
})
