// -*-Mode: C++;-*-
//
//  Common function definitions
//

vec4 Ambient;
vec4 Diffuse;
vec4 Specular;

float rand(float n) { return fract(sin(n) * 43758.5453123); }

void DirectionalLight(in int i, in vec3 normal)
{
  float nDotVP;         // normal . light direction
  float nDotHV;         // normal . light half vector
  float pf;             // power factor
  
  nDotVP = max(0.0, dot(normal,
                        normalize(vec3(gl_LightSource[i].position))));
  nDotHV = max(0.0, dot(normal, vec3(gl_LightSource[i].halfVector)));
  
  if (nDotVP == 0.0)
    pf = 0.0;
  else
    pf = pow(nDotHV, gl_FrontMaterial.shininess);
  
  Ambient  += gl_LightSource[i].ambient;
  Diffuse  += gl_LightSource[i].diffuse * nDotVP;
  Specular += gl_LightSource[i].specular * pf;
}

vec4 flight(in vec3 normal, in vec4 ecPosition, in vec4 incolor)
{
  vec4 color;
  vec3 ecPosition3;
  vec3 eye;

  ecPosition3 = (vec3 (ecPosition)) / ecPosition.w;
  eye = vec3 (0.0, 0.0, 1.0);

  // Clear the light intensity accumulators
  Ambient  = vec4 (0.0);
  Diffuse  = vec4 (0.0);
  Specular = vec4 (0.0);

  //pointLight(0, normal, eye, ecPosition3);
  DirectionalLight(0, normal);

  //color = gl_FrontLightModelProduct.sceneColor;
  //color += Ambient  * gl_FrontMaterial.ambient;
  //color += Diffuse  * gl_FrontMaterial.diffuse;

  color = gl_LightModel.ambient * incolor;
  color += Ambient  * incolor;
  color += Diffuse  * incolor;
  color += Specular * gl_FrontMaterial.specular;
  color = clamp( color, 0.0, 1.0 );
  
  return vec4(color.rgb, incolor.a);
}

float ffog(in float ecDistance)
{
  return(abs(ecDistance));
}

vec4 HSBtoRGB(in vec4 hsb)
{
  vec4 rgb;

  float hue = hsb.x;
  float saturation = hsb.y;
  float brightness = hsb.z;
  rgb.w = hsb.w;

  hue = mod(hue, 1.0);
  saturation = clamp(saturation, 0.0, 1.0);
  brightness = clamp(brightness, 0.0, 1.0);

  // int r = 0, g = 0, b = 0;
  if (saturation<0.001) {
    rgb.r = rgb.g = rgb.b = brightness;
  }
  else {
    float h = hue * 6.0;

    float hi = floor(h);
    float f = h - hi;
    float p = brightness * (1.0 - saturation);
    float q = brightness * (1.0 - saturation * f);
    float t = brightness * (1.0 - (saturation * (1.0 - f)));
    int ihi = int(hi);
    if (ihi == 0) {
      rgb.r = brightness;
      rgb.g = t;
      rgb.b = p;
    }
    else if (ihi == 1) {
      rgb.r = q;
      rgb.g = brightness;
      rgb.b = p;
    }
    else if (ihi == 2) {
      rgb.r = p;
      rgb.g = brightness;
      rgb.b = t;
    }
    else if (ihi == 3) {
      rgb.r = p;
      rgb.g = q;
      rgb.b = brightness;
    }
    else if (ihi == 4) {
      rgb.r = t;
      rgb.g = p;
      rgb.b = brightness;
    }
    else {
      //case 5:
      rgb.r = brightness;
      rgb.g = p;
      rgb.b = q;
    }
  }

  return rgb;
}

//////////////////////////////

vec3 calcFogMix(vec4 color, float z)
{
  float fog;
  fog = (gl_Fog.end - z) * gl_Fog.scale;
  fog = clamp(fog, 0.0, 1.0);
  return mix( gl_Fog.color.rgb, color.rgb, fog );
}

vec4 calcFogAlpha(vec4 color, float z, float frag_alpha)
{
  return vec4(calcFogMix(color, z), color.a * frag_alpha);
}

