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

@include "lib_common.glsl"
@include "lib_atoms.glsl"

//precision mediump float;

////////////////////
// Uniform variables

uniform AtomCrdTex coordTex;

////////////////////
// Vertex attributes

// atom coord indices
#ifdef HAVE_OGL_INTATTR
attribute ivec2 a_ind12;
#else
attribute vec2 a_ind12;
#endif

// color
attribute vec4 a_color;

////////////////////

const vec3 vstar[6] = vec3[] (
  vec3(1.0f, 0.0f, 0.0f),
  vec3(-1.0f, 0.0f, 0.0f),
  vec3(0.0f, 1.0f, 0.0f),
  vec3(0.0f, -1.0f, 0.0f),
  vec3(0.0f, 0.0f, 1.0f),
  vec3(0.0f, 0.0f, -1.0f)
  );

void main (void)
{
  int ind1 = int(a_ind12.x);
  int ind2 = int(a_ind12.y);
  vec3 vpos;

  vec3 pos1 = getAtomPos3(coordTex, ind1);

  if (ind2>=0) {
    vec3 pos2 = getAtomPos3(coordTex, ind2);
    vpos = (pos1+pos2)*0.5f;
  }
  else {
    int ind = -ind2-1;
    vpos = pos1 + vstar[ind] * 0.25f;
  }

  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * vec4(vpos, 1.0);
  //gEcPosition = ecPosition;

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  //gl_FrontColor=vec4(xx, xx, xx, 1.0);
  gl_FrontColor=a_color;

  gl_FogFragCoord = abs(ecPosition.z);
}

