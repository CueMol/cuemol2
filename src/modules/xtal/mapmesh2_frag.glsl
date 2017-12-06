// -*-Mode: C++;-*-
//
//  mapmesh2_frag.glsl:
//    fragment shader
//

@include "lib_common.glsl"

// for fog calc
varying float v_fFogCoord; 
varying float v_fDiscard;

// total transparency
uniform float frag_alpha;

void main (void) 
{
  if (v_fDiscard>0.0)
    discard;

  gl_FragColor = calcFogAlpha(gl_Color, ffog(v_fFogCoord), frag_alpha);
  //gl_FragColor = color;
  //gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}

