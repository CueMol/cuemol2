// -*-Mode: C++;-*-
//
//  SimpleRenderer/double bond vertex shader for OpenGL
//

#if (__VERSION__>=140)
//#define USE_TBO 1
#else
#extension GL_ARB_compatibility : enable
#extension GL_EXT_gpu_shader4 : enable 
#endif

@include "lib_common.glsl"
@include "lib_atoms.glsl"

//precision mediump float;

////////////////////
// Uniform variables

uniform AtomCrdTex coordTex;

uniform float u_cvscl;
//const float u_cvscl = 0.1;

////////////////////
// Vertex attributes

// atom coord indices
attribute vec3 a_ind;

// color
attribute vec4 a_color;

////////////////////

vec3 getNormalVec(in vec3 pos1, in vec3 pos2, in vec3 posd)
{
  vec3 v1 = pos2 - pos1;
  vec3 v2 = posd - pos1;

  vec3 ev1 = normalize(v1);
  vec3 nv1 = v2 - ev1*( dot(ev1,v2) );
  nv1 = normalize(nv1);
  return nv1;
}

void main (void)
{
  int vid = gl_VertexID % 4;
  
  int ind1 = int(a_ind.x);
  int ind2 = int(a_ind.y);
  int ind_d = int(a_ind.z);
  vec3 vpos;

  vec3 pos1 = getAtomPos3(coordTex, ind1);
  vec3 pos2 = getAtomPos3(coordTex, ind2);
  vec3 posd = getAtomPos3(coordTex, ind_d);

  vec3 nv1 = getNormalVec(pos1, pos2, posd);

  vec3 verts[4];
  verts[0] = pos1;
  verts[2] = pos2;
  verts[1] = verts[3] = (pos1+pos2)*0.5f;

  vpos = verts[vid];
  vpos += nv1 * u_cvscl;

  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * vec4(vpos, 1.0);
  //gEcPosition = ecPosition;

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  //gl_FrontColor=vec4(xx, xx, xx, 1.0);
  gl_FrontColor=a_color;

  gl_FogFragCoord = abs(ecPosition.z);
}

