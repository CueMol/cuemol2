// -*-Mode: C++;-*-
//
//  Fog GLSL include file
//

#pragma once

////////////////////
// FogBlock UBO: binding point 1

layout(std140) uniform FogBlock {
    float u_fogEnd;    // offset 0
    float u_fogScale;  // offset 4
    float _fog_p1;     // offset 8  (padding for vec3 alignment)
    float _fog_p2;     // offset 12
    vec3 u_fogColor;   // offset 16
    float _fog_p3;     // offset 28
};

////////////////////

vec4 fragFogColor(in vec4 color, in float frag_alpha, in float fogCoord)
{
    float fog = (u_fogEnd - fogCoord) * u_fogScale;
    fog = clamp(fog, 0.0, 1.0);

    float alpha = color.a * frag_alpha;
    vec3 fogmixed = mix(u_fogColor, vec3(color), fog);
    color = vec4(fogmixed, alpha);

    return color;
}

float ffog(in float ecDistance)
{
    return abs(ecDistance);
}
