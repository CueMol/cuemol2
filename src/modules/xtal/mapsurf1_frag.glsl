// -*-Mode: C++;-*-
//
//  mapsurf1_frag.glsl:
//    fragment shader
//

#if (__VERSION__>=140)
//#extension GL_compatibility : enable
#else
//#extension GL_ARB_compatibility : enable
#endif

#extension GL_EXT_gpu_shader4 : enable 

@include "lib_common.glsl"

////////////////////
// Uniform variables

// total transparency
uniform float frag_alpha;

////////////////////
// varying
varying vec4 v_color;

varying float v_ecpos_z;

flat varying int v_fDiscard;

void main()
{
  if (v_fDiscard!=0)
    discard;

  vec4 color;
  //color = gl_Color;
  color = v_color;

  gl_FragColor = calcFogAlpha(color, ffog(v_ecpos_z), frag_alpha);
  //gl_FragColor = color;
  //gl_FragColor = vec4(1,1,1,1);
}

