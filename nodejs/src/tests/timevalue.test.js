import { cm } from './setup.js';

describe('test timevalue', () => {
  let sut;

  beforeEach(() => {
    sut = cm.createObj("TimeValue");
  });

  it('default value', () => {
    expect(sut).toBeTruthy();
    expect(sut.strval).toBe("0");
  });

  it('toString from millisec and second', () => {
    sut.millisec = 123;
    expect(sut.millisec).toBeCloseTo(123);
    expect(sut.toString()).toBe("0.123");
    expect(sut.strval).toBe("0.123");

    sut.millisec = 123.456;
    expect(sut.millisec).toBeCloseTo(123.456);
    expect(sut.toString()).toBe("0.123");

    sut.second = 123;
    expect(sut.second).toBeCloseTo(123.0);
    expect(sut.toString()).toBe("2:3");

    sut.second = 123.456;
    expect(sut.second).toBeCloseTo(123.456);
    expect(sut.toString()).toBe("2:3.456");

    sut.second = 123456.789;
    expect(sut.second).toBeCloseTo(123456.789);
    expect(sut.toString()).toBe("34:17:36.789");
  });

  it('fromString via strval', () => {
    sut.strval = "0.123";
    expect(sut.millisec).toBeCloseTo(123);

    sut.strval = "2:3";
    expect(sut.second).toBeCloseTo(123.0);

    sut.strval = "2:3.456";
    expect(sut.second).toBeCloseTo(123.456);

    sut.strval = "34:17:36.789";
    expect(sut.second).toBeCloseTo(123456.789);
  });

  it('getXX with and without remainder flag', () => {
    sut.second = 123456.789;

    // With remainder (true)
    expect(sut.getHour()).toBe(34);
    expect(sut.getMinute(true)).toBe(17);
    expect(sut.getSecond(true)).toBe(36);
    expect(sut.getMilliSec(true)).toBe(789);

    // Without remainder (false) - total values
    expect(sut.getMinute(false)).toBe(2057);
    expect(sut.getSecond(false)).toBe(123456);
    expect(sut.getMilliSec(false)).toBe(123456789);
  });

  it('equals', () => {
    const tv1 = cm.createObj("TimeValue");
    tv1.strval = "12:34:56.78";
    const tv2 = cm.createObj("TimeValue");
    tv2.strval = "12:34:56.78";
    expect(tv1.equals(tv2)).toBe(true);

    const tv3 = cm.createObj("TimeValue");
    tv3.strval = "34:56.78";
    expect(tv1.equals(tv3)).toBe(false);
  });
});
