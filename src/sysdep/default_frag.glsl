// -*-Mode: C++;-*-
//
//  Default fragment shader for OpenGL
//

// uniform bool enable_lighting;
uniform float frag_alpha;

//varying vec3 gNormal;
//varying vec4 gEcPosition;

void main (void)
{
  vec4 color;

  color = gl_Color;
  float z = gl_FogFragCoord;

  float fog;
  fog = (gl_Fog.end - z) * gl_Fog.scale;
  fog = clamp(fog, 0.0, 1.0);

  float alpha = color.a * frag_alpha;
  vec3 fogmixed = mix( vec3(gl_Fog.color), vec3(color), fog );
  //vec3 fogmixed = vec3(color);

  //color = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), color.a * frag_alpha);
  //color = vec4(mix( vec3(gl_Fog.color), vec3(color), fog), clamp(color.a, 0.0, 1.0) * frag_alpha);
  color = vec4(fogmixed, alpha);

  gl_FragColor = color;
  
}

