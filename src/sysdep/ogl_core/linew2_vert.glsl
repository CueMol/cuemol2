// -*-Mode: C++;-*-
//
//  Default vertex shader for OpenGL
//
#define attribute in
#define varying out

#include "fog_inc.glsl"
#include "matrices_inc.glsl"

////////////////////
// DrawParamsBlock UBO: binding point 2

layout(std140) uniform DrawParamsBlock {
    float frag_alpha;   // offset 0
    float lineWidth;    // offset 4
    float stippleLen;   // offset 8
    int   u_nodepth;    // offset 12
    vec2  screenSize;   // offset 16
    int   use_u_color;  // offset 24
    float _pad;         // offset 28
    vec4  u_color;      // offset 32
};

////////////////////
// Vertex attributes

// position
layout(location = 0) in vec4 a_vertex1;
layout(location = 1) in vec4 a_vertex2;

// color
layout(location = 2) in vec4 a_color1;
layout(location = 3) in vec4 a_color2;

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
