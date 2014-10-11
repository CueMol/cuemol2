// -*-Mode: C++;-*-
//
//  mapmesh_frag.glsl:
//    fragment shader
//

#version 120

/*
void main(void)
{
  gl_FragColor=gl_Color;
  //gl_FragColor = vec4(1,1,0,1);
}
*/


// for fog calc
varying float FogFragCoord; 

void main (void) 
{
  vec4 color;
  color = gl_Color;
  
  float fog;
  fog = (gl_Fog.end - FogFragCoord) * gl_Fog.scale;
  fog = clamp(fog, 0.0, 1.0);
  color = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), color.a);

  gl_FragColor = color;
}

