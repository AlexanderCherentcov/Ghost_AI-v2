import { describe, it, expect } from 'vitest';
import { parseByteRange } from './http-range';

describe('parseByteRange', () => {
  it('обычный диапазон', () => {
    expect(parseByteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('конец за пределами файла обрезается по размеру', () => {
    expect(parseByteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('suffix-диапазон «последние N байт» (раньше давал NaN и 500)', () => {
    expect(parseByteRange('bytes=-500', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('начало за пределами файла или start > end — 416', () => {
    expect(parseByteRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=500-100', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', 1000)).toBe('unsatisfiable');
  });

  it('мусор, несколько диапазонов и отсутствие заголовка — файл целиком (null)', () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
    expect(parseByteRange('bytes=', 1000)).toBeNull();
    expect(parseByteRange('bytes=abc-def', 1000)).toBeNull();
    expect(parseByteRange('bytes=0-10,20-30', 1000)).toBeNull();
    expect(parseByteRange('items=0-10', 1000)).toBeNull();
    expect(parseByteRange('bytes=0-10', 0)).toBeNull();
  });
});
