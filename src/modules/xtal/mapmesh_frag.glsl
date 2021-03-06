// -*-Mode: C++;-*-
//
//  mapmesh_frag.glsl:
//    fragment shader
//

//#version 140
//#extension GL_ARB_compatibility : enable

// for fog calc
varying float FogFragCoord; 

// total transparency
uniform float frag_alpha;

void main (void) 
{
  vec4 color;
  color = gl_Color;
  
  float fog;
  fog = (gl_Fog.end - FogFragCoord) * gl_Fog.scale;
  fog = clamp(fog, 0.0, 1.0);
  color = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), color.a*frag_alpha);

  gl_FragColor = color;
}

