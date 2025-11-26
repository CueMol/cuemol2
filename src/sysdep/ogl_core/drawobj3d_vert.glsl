// -*-Mode: C++;-*-
//
//  DrawObj Elems 3D vertex shader for OpenGL
//
#define attribute in
#define varying out

////////////////////
// Uniform variables

uniform mat4 u_ModelViewMatrix;
uniform mat4 u_ProjectionMatrix;

////////////////////
// Vertex attributes

attribute vec4 aVertex;
attribute vec4 aColor;

////////////////////
// Varying variables

varying vec4 v_frontColor;

void main(void)
{
    vec4 ecPosition = u_ModelViewMatrix * aVertex;
    gl_Position = u_ProjectionMatrix * ecPosition;
    v_frontColor = aColor;
}
