// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//

////////////////////
// Vertex attributes

// position
attribute vec4 a_vertex;

// color
attribute vec4 a_color;

////////////////////

float ffog(in float ecDistance)
{
    return abs(ecDistance);
}

void main(void)
{
    vec4 ecpos = gl_ModelViewMatrix * a_vertex;
    vec4 pos = gl_ProjectionMatrix * ecpos;
    gl_Position = pos;
    gl_FrontColor = a_color;
    gl_FogFragCoord = ffog(ecpos.z);
}
