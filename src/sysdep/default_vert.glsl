// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//

@include "lib_common.glsl"

uniform bool enable_lighting;

void main (void)
{
  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * gl_Vertex;
  //gEcPosition = ecPosition;

  // Do fixed functionality vertex transform
  gl_Position = gl_ProjectionMatrix * ecPosition;

  if (enable_lighting) {
    vec3 normal = normalize(gl_NormalMatrix * gl_Normal);
    gl_FrontColor = flight(normal, ecPosition, gl_Color);
  }
  else {
    gl_FrontColor=gl_Color;
  }

  gl_FogFragCoord = ffog(ecPosition.z);
}

