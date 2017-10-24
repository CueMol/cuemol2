// -*-Mode: C++;-*-
//
//  SimpleRenderer vertex shader for OpenGL
//

#if (__VERSION__>=140)
//#define USE_TBO 1
#else
#extension GL_ARB_compatibility : enable
#extension GL_EXT_gpu_shader4 : enable 
#endif

//precision mediump float;

////////////////////
// Uniform variables
//uniform sampler1D coordTex;
#ifdef USE_TBO
uniform samplerBuffer coordTex;
#else
#extension GL_EXT_gpu_shader4 : enable
uniform sampler2D coordTex;
#define COORDTEX_WIDTH 1024
#endif

////////////////////
// Vertex attributes

// atom coord indices
//attribute ivec2 a_ind12;
attribute vec2 a_ind12;

// color
attribute vec4 a_color;

////////////////////

vec3 getAtomPos(in int ind)
{
#ifdef USE_TBO
  float x = texelFetch(coordTex, ind*3+0).r;
  float y = texelFetch(coordTex, ind*3+1).r;
  float z = texelFetch(coordTex, ind*3+2).r;
  //return vec3(x,y,z);
  return vec3(ind,-ind,0);
#else
  ivec2 iv;
  iv.x = int( mod(ind, COORDTEX_WIDTH) );
  iv.y = ind/COORDTEX_WIDTH;
  //iv.x = 1;
  return ( texelFetch2D(coordTex, iv, 0).xyz );
#endif
  // return texelFetch1D(coordTex, ind, 0).xyz;
}

float ffog(in float ecDistance)
{
  return(abs(ecDistance));
}

void main (void)
{
  float xx = float(a_ind12.x)/2.0;

  vec3 pos1 = getAtomPos(int(a_ind12.x));
  vec3 pos2 = getAtomPos(int(a_ind12.y));

  vec3 midpos = (pos1+pos2)*0.5;

  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * vec4(midpos, 1.0);
  //gEcPosition = ecPosition;

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  //gl_FrontColor=vec4(xx, xx, xx, 1.0);
  gl_FrontColor=a_color;

  gl_FogFragCoord = ffog(ecPosition.z);
}

