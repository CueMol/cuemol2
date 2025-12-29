// -*-Mode: C++;-*-
//
//  Line width shader
//

#pragma once

void linew_func(in float stippleLen, out float vlength, out float fogCoord)
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

    int ind = gl_VertexID;
    if (ind == 0) {
        // P0
        gl_Position = clipPos1 + of4;
        v_frontColor = a_color1;
        fogCoord = ffog(ecpos1.z);
        vlength = 0.0;
    } else if (ind == 1) {
        // P1
        gl_Position = clipPos1 - of4;
        v_frontColor = a_color1;
        fogCoord = ffog(ecpos1.z);
        vlength = 0.0;
    } else if (ind == 2) {
        // P2
        gl_Position = clipPos2 + of4;
        v_frontColor = a_color2;
        fogCoord = ffog(ecpos2.z);
        vlength = vlen;
    } else {
        // P3
        gl_Position = clipPos2 - of4;
        v_frontColor = a_color2;
        fogCoord = ffog(ecpos2.z);
        vlength = vlen;
    }
}
