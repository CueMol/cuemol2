// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//

////////////////////
// Uniform variables

uniform float edge_width;
uniform vec4 edge_color;

////////////////////
// Vertex attributes

attribute vec4 aVertex;
attribute vec4 aColor;
attribute vec4 aNormal;

void main(void)
{
    // float edge_width = 0.15;
    // vec4 edge_color = vec4(0.0, 0.0, 0.0, 1.0);

    // Eye-coordinate position of vertex, needed in various calculations
    vec4 ecPosition = gl_ModelViewMatrix * aVertex;

    vec3 normal = normalize(gl_NormalMatrix * aNormal.xyz);

    ecPosition += vec4(normal * edge_width, 0);

    // Do fixed functionality vertex transform
    vec4 pos = gl_ProjectionMatrix * ecPosition;

    gl_Position = pos;

    gl_FrontColor = edge_color;

    gl_FogFragCoord = abs(ecPosition.z);
}
