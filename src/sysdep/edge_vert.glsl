// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//

uniform float frag_alpha;
uniform float edge_width;
uniform vec4 edge_color;

void main (void)
{
  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * gl_Vertex;

  vec3 normal = normalize(gl_NormalMatrix * gl_Normal);
  
/*
  vec2 normxy = vec2(normal.x, normal.y);
  float tan = normal.z/length(normxy);

  vec2 xydisp = normalize( normxy ) *edge_width;
  
  ecPosition = ecPosition + vec4(xydisp.x, xydisp.y, 0, 0);
  ecPosition.z -= abs(edge_width/min(edge_width, tan));
*/
  
  ecPosition += vec4(normal*edge_width, 0);
  // gEcPosition = ecPosition;

  // Do fixed functionality vertex transform
  vec4 pos = gl_ProjectionMatrix * ecPosition;

  gl_Position = pos;

  gl_FrontColor=edge_color;

  gl_FogFragCoord = abs(ecPosition.z);
}

