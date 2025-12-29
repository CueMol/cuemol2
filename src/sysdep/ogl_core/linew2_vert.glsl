// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//
#define attribute in
#define varying out

#include "fog_inc.glsl"

////////////////////
// Uniforms
uniform vec2 screenSize;
uniform float lineWidth;
uniform float stippleLen;

uniform mat4 u_ModelViewMatrix;
uniform mat4 u_ProjectionMatrix;

uniform int u_nodepth;

////////////////////
// Vertex attributes

// position
attribute vec4 a_vertex1;
attribute vec4 a_vertex2;

// color
attribute vec4 a_color1;
attribute vec4 a_color2;

////////////////////
// Varying

varying float v_length;
varying vec4 v_frontColor;
varying float v_fogCoord;

////////////////////

#include "linew_inc.glsl"

void main(void)
{
    linew_func(stippleLen, v_length, v_fogCoord);

    if (u_nodepth > 0) {
        // billboarded line without depth
        gl_Position.z = -0.99;
        gl_Position.w = 1.0;
        v_fogCoord = 0.0;
    }
}
