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

////////////////////
// Vertex attributes

// position
attribute vec4 a_vertex1;
attribute vec4 a_vertex2;

// color
attribute vec4 a_color1;
attribute vec4 a_color2;

// vertex index
attribute float a_index;

////////////////////
// Varying

varying float v_length;
varying vec4 v_frontColor;
varying float v_fogCoord;

////////////////////

void main(void)
{
    vec4 ecpos1 = u_ModelViewMatrix * a_vertex1;
    vec4 clipPos1 = u_ProjectionMatrix * ecpos1;

    vec4 ecpos2 = u_ModelViewMatrix * a_vertex2;
    vec4 clipPos2 = u_ProjectionMatrix * ecpos2;

    vec2 p1_screen = ((clipPos1.xy / clipPos1.w) * 0.5 + 0.5) * screenSize;
    vec2 p2_screen = ((clipPos2.xy / clipPos2.w) * 0.5 + 0.5) * screenSize;

    vec2 direction = normalize(p2_screen - p1_screen);
    vec2 normal = vec2(-direction.y, direction.x);

    vec2 offset = (normal * lineWidth * 0.5) / screenSize * 2.0;
    vec4 of4 = vec4(offset * clipPos1.w, 0.0, 0.0);

    float vlen;
    if (stippleLen > 0.0) {
        vlen = length(p1_screen.xy - p2_screen.xy);
    } else {
        vlen = 0.0;
    }

    int ind = int(a_index);
    if (ind == 0) {
        // P0
        // gl_Position = vec4(clipPos1.xy / clipPos1.w + offset, clipPos1.z /
        // clipPos1.w, 1.0);
        gl_Position = clipPos1 + of4;
        v_fogCoord = ffog(ecpos1.z);
        v_frontColor = a_color1;
        v_length = 0.0;
    } else if (ind == 1) {
        // P1
        // gl_Position = vec4(clipPos1.xy / clipPos1.w - offset, clipPos1.z /
        // clipPos1.w, 1.0);
        gl_Position = clipPos1 - of4;
        v_fogCoord = ffog(ecpos1.z);
        v_frontColor = a_color1;
        v_length = 0.0;
    } else if (ind == 2) {
        // P2
        // gl_Position = projection * (p2 + vec4(normal, 0.0, 0.0));
        gl_Position = clipPos2 + of4;
        v_fogCoord = ffog(ecpos2.z);
        v_frontColor = a_color2;
        v_length = vlen;
    } else if (ind == 3) {
        // P2
        // gl_Position = projection * (p2 + vec4(normal, 0.0, 0.0));
        gl_Position = clipPos2 + of4;
        v_fogCoord = ffog(ecpos2.z);
        v_frontColor = a_color2;
        v_length = vlen;
    } else if (ind == 4) {
        // P1
        // gl_Position = projection * (p1 - vec4(normal, 0.0, 0.0));
        gl_Position = clipPos1 - of4;
        v_fogCoord = ffog(ecpos1.z);
        v_frontColor = a_color1;
        v_length = 0.0;
    } else {
        // P3
        // gl_Position = projection * (p2 - vec4(normal, 0.0, 0.0));
        gl_Position = clipPos2 - of4;
        v_fogCoord = ffog(ecpos2.z);
        v_frontColor = a_color2;
        v_length = vlen;
    }

    // v_frontColor = vec4(1.0, 1.0, 1.0, 1.0);
}
