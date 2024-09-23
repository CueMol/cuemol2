import * as core from '../index.js';

const cm = core.createCueMol();

describe('test vector', () => {
  let sut;

  beforeEach(() => {
    sut = cm.createObj("Vector");
  });

  it('vector props', () => {
    let v = sut;
    v.x = 10.2
    v.y = 100.1
    v.z = 1111.3
    v.w = 1234.5
    expect(v.x).toBe(10.2)
    expect(v.y).toBe(100.1)
    expect(v.z).toBe(1111.3)
    expect(v.w).toBe(1234.5)
  })

  it('vector strvalue', () => {
    let vec_obj = sut;
    expect(vec_obj.strvalue).toBe('(0,0,0)')
    vec_obj.strvalue = '(1, 2, 3.14)'
    expect(vec_obj.strvalue).toBe('(1,2,3.14)')
  })

  it('vector_init', () => {
    let v = sut;
    expect(v.x).toBe(0.0)
    expect(v.y).toBe(0.0)
    expect(v.z).toBe(0.0)
    expect(v.w).toBe(0.0)

    v.set3(1.0, 2.3, 4.5)
    expect(v.x).toBe(1.0)
    expect(v.y).toBe(2.3)
    expect(v.z).toBe(4.5)
    expect(v.w).toBe(0.0)
    
    v.set4(11.0, 12.3, 14.5, 34.5)
    expect(v.x).toBe(11.0)
    expect(v.y).toBe(12.3)
    expect(v.z).toBe(14.5)
    expect(v.w).toBe(34.5)
  })
});
