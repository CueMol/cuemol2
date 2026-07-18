// -*-Mode: C++;-*-
//
//  Vertex shader for wide lines with texture-fetched endpoints.
//
//  Thin wrapper around linew_inc.glsl (the shared screen-space width-quad
//  expansion). Each endpoint attribute packs a model-space offset in xyz and
//  the coordinate-texture atom index in w. The fetched atom position plus the
//  offset is written to the global a_vertex1 / a_vertex2 that linew_func()
//  consumes, so linew_inc.glsl is reused unchanged.
//
#define attribute in
#define varying out

#include "fog_inc.glsl"
#include "matrices_inc.glsl"
#include "lib_atoms.glsl"

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
// Vertex attributes (index variant)

// endpoint 1: xyz = model-space offset, w = atom index into the coordinate texture
layout(location = 0) in vec4 a_p1;
layout(location = 1) in vec4 a_p2;

// color
layout(location = 2) in vec4 a_color1;
layout(location = 3) in vec4 a_color2;

uniform sampler2D u_coordTex;

////////////////////
// Endpoint positions consumed by linew_func() (globals, filled in main)

vec4 a_vertex1;
vec4 a_vertex2;

////////////////////
// Varying

varying float v_length;
varying vec4 v_frontColor;
varying float v_fogCoord;

////////////////////

#include "linew_inc.glsl"

void main(void)
{
    a_vertex1 = vec4(getAtomPos3(u_coordTex, int(a_p1.w)) + a_p1.xyz, 1.0);
    a_vertex2 = vec4(getAtomPos3(u_coordTex, int(a_p2.w)) + a_p2.xyz, 1.0);

    linew_func(stippleLen, v_length, v_fogCoord);

    if (u_nodepth > 0) {
        // billboarded line without depth
        gl_Position.z = -0.99;
        gl_Position.w = 1.0;
        v_fogCoord = 0.0;
    }
}
