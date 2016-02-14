// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//

uniform float frag_alpha;
uniform float edge_width;
uniform vec4 edge_color;

float ffog(in float ecDistance)
{
  return(abs(ecDistance));
}

vec3 fnormal(void)
{
  //Compute the normal
  vec3 normal = gl_NormalMatrix * gl_Normal;
  normal = normalize(normal);
  return normal;
}

void main (void)
{
  //vec3  transformedNormal;

  // Eye-coordinate position of vertex, needed in various calculations
  vec4 ecPosition = gl_ModelViewMatrix * gl_Vertex;

  vec3 normal = fnormal();

  vec3 disp = normal*edge_width;
  ecPosition = ecPosition + vec4(disp.x, disp.y, 0, 0);

  // Do fixed functionality vertex transform
  vec4 pos = gl_ProjectionMatrix * ecPosition;

  gl_Position = pos;

  gl_FrontColor=edge_color;

  gl_FogFragCoord = ffog(ecPosition.z);
}

