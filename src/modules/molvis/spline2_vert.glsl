// -*-Mode: C++;-*-
//
//  Spline2Renderer vertex shader for OpenGL
//


#extension GL_ARB_compatibility : enable

#if (__VERSION__>=140)
#define USE_TBO 1
#else
#extension GL_EXT_gpu_shader4 : enable 
#endif

//precision mediump float;

////////////////////
// Uniform variables
#ifdef USE_TBO
uniform samplerBuffer coefTex;
#else
uniform sampler1D coefTex;
#endif

uniform int u_npoints;

////////////////////
// Vertex attributes

// spline rho param
attribute float a_rho;

// color
attribute vec4 a_color;

////////////////////

float ffog(in float ecDistance)
{
  return(abs(ecDistance));
}

void getCoefs(in int ind, out vec3 vc0, out vec3 vc1, out vec3 vc2, out vec3 vc3)
{
#ifdef USE_TBO
  vc0.x = texelFetch(coefTex, ind*12+0).r;
  vc0.y = texelFetch(coefTex, ind*12+1).r;
  vc0.z = texelFetch(coefTex, ind*12+2).r;

  vc1.x = texelFetch(coefTex, ind*12+3).r;
  vc1.y = texelFetch(coefTex, ind*12+4).r;
  vc1.z = texelFetch(coefTex, ind*12+5).r;

  vc2.x = texelFetch(coefTex, ind*12+6).r;
  vc2.y = texelFetch(coefTex, ind*12+7).r;
  vc2.z = texelFetch(coefTex, ind*12+8).r;

  vc3.x = texelFetch(coefTex, ind*12+9).r;
  vc3.y = texelFetch(coefTex, ind*12+10).r;
  vc3.z = texelFetch(coefTex, ind*12+11).r;
#else
  vc0 = texelFetch1D(coefTex, ind*4+0, 0).xyz;
  vc1 = texelFetch1D(coefTex, ind*4+1, 0).xyz;
  vc2 = texelFetch1D(coefTex, ind*4+2, 0).xyz;
  vc3 = texelFetch1D(coefTex, ind*4+3, 0).xyz;
#endif
}

vec3 interpolate(in float rho)
{
  vec3 coef0, coef1, coef2, coef3;

  int ncoeff = int(floor(rho));
  ncoeff = clamp(ncoeff, 0, u_npoints-2);

  getCoefs(ncoeff, coef0, coef1, coef2, coef3);

  float f = rho - float(ncoeff);

  vec3 rval;
  rval = coef3*f + coef2;
  rval = rval*f + coef1;
  rval = rval*f + coef0;

  return rval;
}

void main (void)
{
  //float xx = float(a_ind12.x)/2.0;
  vec3 pos1 = interpolate(a_rho);

  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * vec4(pos1, 1.0);
  //gEcPosition = ecPosition;

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  //gl_FrontColor=vec4(xx, xx, xx, 1.0);
  gl_FrontColor=a_color;

  gl_FogFragCoord = ffog(ecPosition.z);
}

