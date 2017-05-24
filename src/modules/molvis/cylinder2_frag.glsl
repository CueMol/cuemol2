// -*-Mode: C++;-*-
//
//  fragment shader for cylinders
//

@include "lib_common.glsl"

uniform float frag_alpha;

varying vec4 v_color;
varying vec2 v_impos;
varying vec4 v_ecpos;

varying float v_ndec;

void main()
{
if (v_impos.y<-1.0 ||
      v_impos.y> 1.0) {
    gl_FragColor = vec4(0,0,1,1);
  }  
  else if (v_impos.x<-1.0 ||
      v_impos.x> 1.0) {
    gl_FragColor = vec4(0,0,0,1);
  }
  else {
    gl_FragColor = vec4((v_impos.x+1)*0.5,
                        (v_impos.y+1)*0.5, 0, 1);
  }

  //gl_FragColor = v_color;
  //gl_FragColor = vec4(1,1,1,1);
}

