// -*-Mode: C++;-*-
//
//  Common GLSL include file
//

#pragma once

////////////////////
// Lighting

vec4 Ambient;
vec4 Diffuse;
vec4 Specular;

// void DirectionalLight(in int i, in vec3 normal)

void DirectionalLight(in vec3 normal)
{
    float nDotVP;  // normal . light direction
    float nDotHV;  // normal . light half vector
    float pf;      // power factor

    nDotVP = max(0.0, dot(normal, normalize(vec3(gl_LightSource[0].position))));
    nDotHV = max(0.0, dot(normal, vec3(gl_LightSource[0].halfVector)));

    if (nDotVP == 0.0)
        pf = 0.0;
    else
        pf = pow(nDotHV, gl_FrontMaterial.shininess);

    Ambient += gl_LightSource[0].ambient;
    Diffuse += gl_LightSource[0].diffuse * nDotVP;
    Specular += gl_LightSource[0].specular * pf;
}

vec4 flight(in vec3 normal, in vec4 ecPosition, in vec4 a_color)
{
    vec4 color;
    vec3 ecPosition3;
    vec3 eye;

    ecPosition3 = (vec3(ecPosition)) / ecPosition.w;
    eye = vec3(0.0, 0.0, 1.0);

    // Clear the light intensity accumulators
    Ambient = vec4(0.0);
    Diffuse = vec4(0.0);
    Specular = vec4(0.0);

    // pointLight(0, normal, eye, ecPosition3);
    DirectionalLight(normal);

    color = gl_LightModel.ambient * a_color;
    color += Ambient * a_color;
    color += Diffuse * a_color;
    color += Specular * gl_FrontMaterial.specular;
    color = clamp(color, 0.0, 1.0);
    return color;
}
