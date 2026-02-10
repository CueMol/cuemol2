import { cm } from '../setup.js';

describe('test vector', () => {
  let sut;

  beforeEach(() => {
    sut = cm.createObj("Vector");
  });

  it('props', () => {
    sut.x = 10.2;
    sut.y = 100.1;
    sut.z = 1111.3;
    sut.w = 1234.5;
    expect(sut.x).toBe(10.2);
    expect(sut.y).toBe(100.1);
    expect(sut.z).toBe(1111.3);
    expect(sut.w).toBe(1234.5);
  });

  it('strvalue', () => {
    expect(sut.strvalue).toBe('(0,0,0)');
    sut.strvalue = '(1, 2, 3.14)';
    expect(sut.strvalue).toBe('(1,2,3.14)');
  });

  it('init and set3/set4', () => {
    expect(sut.x).toBe(0.0);
    expect(sut.y).toBe(0.0);
    expect(sut.z).toBe(0.0);
    expect(sut.w).toBe(0.0);

    sut.set3(1.0, 2.3, 4.5);
    expect(sut.x).toBe(1.0);
    expect(sut.y).toBe(2.3);
    expect(sut.z).toBe(4.5);
    expect(sut.w).toBe(0.0);

    sut.set4(11.0, 12.3, 14.5, 34.5);
    expect(sut.x).toBe(11.0);
    expect(sut.y).toBe(12.3);
    expect(sut.z).toBe(14.5);
    expect(sut.w).toBe(34.5);
  });
});
