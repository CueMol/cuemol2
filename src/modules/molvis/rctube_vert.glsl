// -*-Mode: C++;-*-
//
//  GLSLRcTubeRenderer vertex shader for OpenGL
//

#if (__VERSION__>=140)
#define USE_TBO 1
#define USE_INSTANCED 1
#else
#extension GL_EXT_gpu_shader4 : enable 
#endif

//precision mediump float;

#ifdef USE_TBO
#define TextureType samplerBuffer
#else
#define TextureType sampler1D
#endif

const float M_2PI = 3.141592653589793238462643383 * 2.0;

////////////////////
// Uniform variables

uniform TextureType coefTex;
uniform TextureType binormTex;
uniform TextureType puttyTex;

/// axial interpolation points
uniform int u_npoints;

/// smooth coloring
uniform int u_bsmocol;

#ifndef USE_INSTANCED
uniform int u_InstanceID;
#endif

uniform float u_width1;
uniform float u_width2;
//uniform float u_tuber;
uniform float u_efac;

////////////////////
// Vertex attributes

// spline rho param
attribute vec2 a_rho;

////////////////////
// Varying variables

varying vec2 v_st;
varying vec4 v_ecpos;
//varying vec2 v_norm;

////////////////////

void getCoefs(in int ind, out vec3 vc0, out vec3 vc1, out vec3 vc2, out vec3 vc3)
{
#ifdef USE_TBO
  vc0 = texelFetch(coefTex, ind*4+0).xyz;
  vc1 = texelFetch(coefTex, ind*4+1).xyz;
  vc2 = texelFetch(coefTex, ind*4+2).xyz;
  vc3 = texelFetch(coefTex, ind*4+3).xyz;
#else
  vc0 = texelFetch1D(coefTex, ind*4+0, 0).xyz;
  vc1 = texelFetch1D(coefTex, ind*4+1, 0).xyz;
  vc2 = texelFetch1D(coefTex, ind*4+2, 0).xyz;
  vc3 = texelFetch1D(coefTex, ind*4+3, 0).xyz;
#endif
}

vec3 getBinorm(in int ind)
{
#ifdef USE_TBO
  return texelFetch(binormTex, ind).xyz;
#else
  return texelFetch1D(binormTex, ind, 0).xyz;
#endif
}

void interpolate2(in float rho, out vec3 rval, out vec3 drval)
{
  vec3 coef0, coef1, coef2, coef3;

  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  getCoefs(ncoeff, coef0, coef1, coef2, coef3);

  float f = rho - float(ncoeff);

  rval = coef3*f + coef2;
  rval = rval*f + coef1;
  rval = rval*f + coef0;

  drval = coef3*(3.0*f) + coef2*2.0;
  drval = drval*f + coef1;
}

vec3 calcBinorm(in float rho)
{
  vec3 coef0, coef1, coef2, coef3;

  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  float f = rho - float(ncoeff);

  vec3 cp0 = getBinorm(ncoeff);
  vec3 cp1 = getBinorm(ncoeff+1);

  return mix(cp0, cp1, f);
}

vec2 getEScl(in float rho)
{
  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);
  float f = rho - float(ncoeff);

  vec2 val0, val1;
#ifdef USE_TBO
  val0 = texelFetch(puttyTex, ncoeff).xy;
  val1 = texelFetch(puttyTex, ncoeff+1).xy;
#else
  val0 = texelFetch1D(puttyTex, ncoeff, 0).xy;
  val1 = texelFetch1D(puttyTex, ncoeff+1, 0).xy;
#endif

  return mix(val0, val1, f);
}

void st2pos(in vec2 st, in float efac, out vec4 pos)
{
  vec3 f, v0;
  interpolate2(st.s, f, v0);

  float v0len = length(v0);
  vec3 e0 = v0/v0len;
  
  vec3 v2 = calcBinorm(st.s);
  vec3 e2 = normalize(v2);

  vec3 e1 = cross(e2, e0);

  vec2 escl = getEScl(st.s);

  //float th = st.t * M_2PI;
  float th = st.t;
  float si = sin(th);
  float co = cos(th);
  vec3 pos3 = f + e1*(co*u_width1*efac*escl.x) + e2*(si*u_width2*efac*escl.y);

  pos = vec4(pos3, 1.0);
}

void main (void)
{
  vec2 st;
#ifdef USE_INSTANCED
  st.s = a_rho.x + gl_InstanceID;
#else
  st.s = a_rho.x + u_InstanceID;
#endif
  st.t = a_rho.y;

  vec4 pos1;
  st2pos(st, u_efac, pos1);

  vec4 ecpos1 = gl_ModelViewMatrix * pos1;

  //ecpos2.z = ecpos1.z;

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecpos1;

  // gl_FogFragCoord = ffog(ecpos1.z);

  v_ecpos = ecpos1;
  v_st = st;
}

