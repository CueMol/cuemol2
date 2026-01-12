// -*-Mode: C++;-*-
//
//  Fog GLSL include file
//

#pragma once

////////////////////
// Uniform variables

uniform float u_fogEnd;
uniform float u_fogScale;
uniform vec3 u_fogColor;

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
