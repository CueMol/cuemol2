// -*-Mode: C++;-*-
//
//  mapmesh2_frag.glsl:
//    fragment shader
//

@include "lib_common.glsl"

// for fog calc
varying float v_fFogCoord; 
//flat in int v_bDiscard;

// total transparency
uniform float frag_alpha;

uniform vec4 u_color;

void main (void) 
{
  //if (v_bDiscard<0)
  //discard;

  gl_FragColor = calcFogAlpha(u_color, ffog(v_fFogCoord), frag_alpha);
  //gl_FragColor = color;
  //gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}

