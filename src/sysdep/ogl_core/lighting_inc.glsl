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

//////////
// simple lighting version

// These should be set as uniforms from the application
// uniform vec4 u_LightSourcePosition;
// uniform float u_FrontMaterialShininess;
// uniform float u_LightSourceAmbient;
// uniform float u_LightSourceDiffuse;
// uniform float u_LightSourceSpecular;

void directionalLight2(in vec3 normal)
{
    // TODO: make these uniforms
    vec4 u_LightSourcePosition = vec4(1.0, 1.0, 1.5, 0.0);
    float u_FrontMaterialShininess = 32.0;
    float u_LightSourceAmbient = 0.2;
    float u_LightSourceDiffuse = 0.8;
    float u_LightSourceSpecular = 0.4;

    float nDotVP;  // normal . light direction
    float nDotHV;  // normal . light half vector
    float pf;      // power factor

    vec3 lightSource_position = u_LightSourcePosition.xyz;
    vec3 lightSource_halfVector = normalize(lightSource_position + vec3(0, 0, 1));
    nDotVP = max(0.0, dot(normal, normalize(lightSource_position)));
    nDotHV = max(0.0, dot(normal, lightSource_halfVector));

    // float shininess = u_light.shininess;
    float shininess = u_FrontMaterialShininess;
    if (nDotVP == 0.0)
        pf = 0.0;
    else
        pf = pow(nDotHV, shininess);

    Ambient = vec4(u_LightSourceAmbient, u_LightSourceAmbient, u_LightSourceAmbient, 0.0);
    Diffuse = vec4(u_LightSourceDiffuse, u_LightSourceDiffuse, u_LightSourceDiffuse, 0.0) * nDotVP;
    Specular = vec4(u_LightSourceSpecular, u_LightSourceSpecular, u_LightSourceSpecular, 0.0) * pf;
}

vec4 flight2(in vec3 normal, in vec4 ecPosition, in vec4 in_color)
{
    vec4 color;

    directionalLight2(normal);

    // TODO: make these uniforms
    vec4 lightModel_ambient = vec4(0.2, 0.2, 0.2, 1.0);
    vec4 frontMaterial_specular = vec4(0.4, 0.4, 0.4, 1.0);

    color = lightModel_ambient * in_color;
    color += Ambient * in_color;
    color += Diffuse * in_color;
    color += Specular * frontMaterial_specular;
    color = clamp(color, 0.0, 1.0);
    return color;
}
