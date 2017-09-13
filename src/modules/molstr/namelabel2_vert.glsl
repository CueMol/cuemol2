// -*-Mode: C++;-*-
//
//  NameLabel2 vertex shader for OpenGL
//

@include "lib_common.glsl"

////////////////////
// Vertex attributes

attribute vec3 a_xyz;

attribute vec2 a_wh;

void main (void)
{
  //int ind = gl_VertexID%4;

  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * vec4(a_xyz, 1.0);
  //gEcPosition = ecPosition;

  ecPosition.x += a_wh.x;
  ecPosition.y += a_wh.y;
//}

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  gl_FrontColor=gl_Color;

  gl_FogFragCoord = ffog(ecPosition.z);
}

