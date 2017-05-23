// -*-Mode: C++;-*-
//
//  fragment shader for cylinders
//

@include "lib_common.glsl"

uniform float frag_alpha;

varying vec4 v_color;

void main()
{
  gl_FragColor = v_color;
  //gl_FragColor = vec4(1,1,1,1);
}

