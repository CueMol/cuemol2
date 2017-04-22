// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//

uniform float frag_alpha;

vec3 calcFogMix(vec4 color)
{
  float z = gl_FogFragCoord;
  float fog;
  fog = (gl_Fog.end - z) * gl_Fog.scale;
  fog = clamp(fog, 0.0, 1.0);
  return mix( gl_Fog.color.rgb, color.rgb, fog );
}

vec4 calcAlphaMix(vec4 color)
{
  return vec4(calcFogMix(color), color.a * frag_alpha);
}

void main (void)
{
//  float nDot = dot(gNormal, normalize(vec3(gEcPosition)));
//  if (nDot<-0.5||nDot>0.5)
//    discard;

  gl_FragColor = calcAlphaMix(gl_Color);
}

