// -*-Mode: C++;-*-
//
//  mapmesh_frag.glsl:
//    fragment shader
//

varying vec4 v_frontColor;
varying float v_fogCoord; 

// total transparency
uniform float frag_alpha;

out vec4 o_FragColor;

void main (void) 
{
  // vec4 color;
  // color = gl_Color;
  
  // float fog;
  // fog = (gl_Fog.end - FogFragCoord) * gl_Fog.scale;
  // fog = clamp(fog, 0.0, 1.0);
  // color = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), color.a*frag_alpha);

  // gl_FragColor = color;

  o_FragColor = vec4(1.0, 1.0, 1.0, 1.0); //fragFogColor(v_frontColor, frag_alpha, v_fogCoord);
}

