// -*-Mode: C++;-*-
//
//  OpenGL program object/shader implementation
//

#include <common.h>

#include "OglProgramObject.hpp"
#include "OglError.hpp"

#include <qlib/FileStream.hpp>
#include <qsys/SysConfig.hpp>
#include <gfx/DisplayContext.hpp>

#if defined(HAVE_GLEW) || defined(USE_GLES2)

using namespace sysdep;
using qsys::SysConfig;

// static
LString OglShObjImpl::s_shaderVerStr;

OglShObjImpl::~OglShObjImpl()
{
  if (m_hGL) {
    MB_DPRINTLN("OglShader %d destroyed", m_hGL);
    //glDeleteObjectARB(m_hGL);
    glDeleteShader(m_hGL);
  }
}

void OglShObjImpl::loadFile(const LString& filename)
{
    // CLR_GLERROR();
    glGetError();
    // CHK_GLERROR("SO.loadFile createShader BEFORE");

  //m_hGL = glCreateShaderObjectARB(m_nType);
  m_hGL = glCreateShader(m_nType);
  CHK_GLERROR("SO.loadFile createShader");
  GLenum errc = glGetError();
  if ( errc != GL_NO_ERROR ) {
    LOG_DPRINTLN("ShaderObject::ShaderObject(): cannot create shader object: %s",
                 filename.c_str());
    MB_THROW(qlib::RuntimeException, "glCreateShader error");
    return;
  }

  SysConfig *pconf = SysConfig::getInstance();
  LString fnam = pconf->convPathName(filename);

  // read source file
  qlib::FileInStream fis;
  fis.open(fnam);
  char sbuf[1024];
  m_source = "";
  while (fis.ready()) {
    int n = fis.read(sbuf, 0, sizeof sbuf-1);
    sbuf[n] = '\0';
    m_source += sbuf;
  }

  if (s_shaderVerStr.isEmpty()) {
      // get default shader version string
      LString verstr = (const char *) glGetString(GL_SHADING_LANGUAGE_VERSION);
      // GL
      int vmaj=0, vmin=0;
      if (sscanf(verstr.c_str(), "%d.%d", &vmaj, &vmin)==2) {
          s_shaderVerStr = LString::format("%d%d", vmaj, vmin);
      }
      else {
          s_shaderVerStr = "120";
      }
      MB_DPRINTLN("OglProgramObject> Using default shader version string: %s",
                  s_shaderVerStr.c_str());
  }
  auto verStr = LString::format("#version %s\n\n", s_shaderVerStr.c_str());
  m_source = verStr + m_source;

  // set shader source
  const char *s = m_source.c_str();
  int l = m_source.length();

  //glShaderSourceARB( m_hGL, 1, &s, &l );
  glShaderSource( m_hGL, 1, &s, &l );
  if ( glGetError() != GL_NO_ERROR ) {
    CHK_GLERROR("SO.loadFile");
    LOG_DPRINTLN("ShaderObject::ShaderObject(): cannot set shader source: %s",
                 fnam.c_str());
    MB_THROW(qlib::RuntimeException, "glShaderSource error");
  }

  m_name = fnam;
}

bool OglShObjImpl::compile()
{
  int length, l;

  // CLR_GLERROR();
  glGetError();

  // compile
  glCompileShader(m_hGL);
  //glCompileShaderARB(m_hGL);

  // check errors
  GLint result;
  //glGetObjectParameterivARB(m_hGL, GL_OBJECT_COMPILE_STATUS_ARB, &result);
  glGetShaderiv(m_hGL, GL_COMPILE_STATUS, &result);

  if ( glGetError() != GL_NO_ERROR || result == GL_FALSE ) {
    LOG_DPRINTLN("ShaderObject::Compile(): cannot compile shader: %s", m_name.c_str());
    //glGetObjectParameterivARB( m_hGL, GL_OBJECT_INFO_LOG_LENGTH_ARB, &length );
    glGetShaderiv( m_hGL, GL_INFO_LOG_LENGTH, &length );
    if (length>0) {
      GLchar *info_log = new GLchar[ length ];
      //glGetInfoLogARB( m_hGL, length, &l, info_log );
      glGetShaderInfoLog( m_hGL, length, &l, info_log );
      LOG_DPRINTLN("%s", info_log);
      delete [] info_log;
    }
    MB_THROW(qlib::RuntimeException, "glCompileSource error");
    return false;
  }
  else {
#ifdef MB_DEBUG
    glGetShaderiv( m_hGL, GL_INFO_LOG_LENGTH, &length );
    if (length>0) {
      GLchar *info_log = new GLchar[ length ];
      //glGetInfoLogARB( m_hGL, length, &l, info_log );
      glGetShaderInfoLog( m_hGL, length, &l, info_log );
      LOG_DPRINTLN("OglSO> %s", info_log);
      delete [] info_log;
    }
#endif
  }

  return true;
}

////////////////////////

bool OglProgramObject::init()
{
  // CLR_GLERROR();
  // glGetError();

  m_hPO = glCreateProgram();

  // GLenum errc = glGetError();
  // if ( errc != GL_NO_ERROR ) {
  //   LOG_DPRINTLN("ProgramObject::ProgramObject(): cannot create program object (%d; %s)",
  //                errc, gluErrorString(errc));
  //   return false;
  // }

  return true;
}

OglProgramObject::~OglProgramObject()
{
  MB_DPRINTLN("OglProgramObj %d destroyed", m_hPO);
  clear();
  if (m_uboMatrices   != 0) glDeleteBuffers(1, &m_uboMatrices);
  if (m_uboFog        != 0) glDeleteBuffers(1, &m_uboFog);
  if (m_uboDrawParams != 0) glDeleteBuffers(1, &m_uboDrawParams);
  // glDeleteObjectARB(m_hPO);
  glDeleteProgram(m_hPO);
}

void OglProgramObject::clear()
{
  BOOST_FOREACH (ShaderTab::value_type &elem, m_shaders) {
    delete elem.second;
  }
  m_shaders.clear();
}

bool OglProgramObject::loadShaders(const qlib::MapTable<qlib::LString> &file_names)
{
    // TODO: implement shader loading from multiple files
    return false;
}

bool OglProgramObject::loadShader(const LString &name, const LString &srcpath, GLenum shader_type)
{
  ShaderTab::const_iterator i = m_shaders.find(name);
  if (i!=m_shaders.end())
    return false;
  
  OglShObjImpl *pVS = new OglShObjImpl(shader_type);
  if (pVS==NULL)
    return false;

  LOG_DPRINTLN("PO> Loading shader: %s", srcpath.c_str());
  pVS->loadFile(srcpath);
  pVS->compile();
  attach(pVS);
  m_shaders.insert(ShaderTab::value_type(name, pVS));

  LOG_DPRINTLN("PO> Loading shader OK");
  return true;
}

void OglProgramObject::attach( const OglShObjImpl *s )
{
    CLR_GLERROR();
    glAttachShader( m_hPO, s->getHandle());
    CHK_GLERROR("glAttachShader( m_hPO, s->getHandle())");
}

bool OglProgramObject::link()
{
  int length, l;

  // CLR_GLERROR();
  glGetError();

  // link
  //glLinkProgramARB(m_hPO);
  glLinkProgram(m_hPO);

  // get errors
  GLint result;
  //glGetObjectParameterivARB(m_hPO, GL_OBJECT_LINK_STATUS_ARB, &result);
  glGetProgramiv(m_hPO, GL_LINK_STATUS, &result);

  if ( glGetError() != GL_NO_ERROR || result == GL_FALSE ) {
    LOG_DPRINTLN("ProgramObject.link(): cannot link program object");

    //glGetObjectParameterivARB(m_hPO, GL_OBJECT_INFO_LOG_LENGTH_ARB, &length);
    glGetProgramiv(m_hPO, GL_INFO_LOG_LENGTH, &length);
    if (length>0) {
      GLchar *info_log = new GLchar[ length ];
      //glGetInfoLogARB(m_hPO, length, &l, info_log );
      glGetProgramInfoLog(m_hPO, length, &l, info_log );
      LOG_DPRINTLN("%s", info_log);
      delete [] info_log;
    }
    MB_THROW(qlib::RuntimeException, "glLinkProgram error");
    // return false;
  }
  else {
#ifdef MB_DEBUG
    glGetProgramiv(m_hPO, GL_INFO_LOG_LENGTH, &length);
    if (length>0) {
      GLchar *info_log = new GLchar[ length ];
      glGetProgramInfoLog(m_hPO, length, &l, info_log );
      LOG_DPRINTLN("OglPO> %s", info_log);
      delete [] info_log;
    }
#endif

    // Bind UBO blocks to their binding points.
    // layout(binding=N) requires GLSL 4.2+ and is unavailable on macOS (max 4.1)
    // and WebGL2 (GLSL ES 3.00), so we set binding points programmatically.
    auto bindBlock = [this](const char *name, GLuint bp) {
      GLuint idx = glGetUniformBlockIndex(m_hPO, name);
      if (idx != GL_INVALID_INDEX)
        glUniformBlockBinding(m_hPO, idx, bp);
    };
    bindBlock("MatricesBlock",   0);
    bindBlock("FogBlock",        1);
    bindBlock("DrawParamsBlock", 2);
  }

  return true;
}

void OglProgramObject::enable()
{
  CLR_GLERROR();
  glUseProgram(m_hPO);
  CHK_GLERROR("PO.use");
}

void OglProgramObject::disable()
{
    glUseProgram(0);
}

void OglProgramObject::validate()
{
  GLint logLength, status;

  glValidateProgram(m_hPO);
  glGetProgramiv(m_hPO, GL_INFO_LOG_LENGTH, &logLength);
  if (logLength > 0) {
    GLchar *log = new GLchar[logLength];
    glGetProgramInfoLog(m_hPO, logLength, &logLength, log);
    //NSLog(@"Program validate log:\n%s", log);
    LOG_DPRINTLN("OglPO validate> %s", log);
    delete [] log;
  }

  glGetProgramiv(m_hPO, GL_VALIDATE_STATUS, &status);
  if (status == GL_FALSE) {
    // NSLog(@"Failed to validate program %d", prog);
    LOG_DPRINTLN("OglPO validate> FAILED!!");
  }

  return;
}

void OglProgramObject::setProgParam(GLenum pname, GLint param)
{
#ifndef USE_GLES2
  CLR_GLERROR();
  glProgramParameteri(m_hPO, pname, param);
  CHK_GLERROR("PO.setProgParam");
#endif
}

void OglProgramObject::setMatrix(const LString &name, const qlib::Matrix4D &mat)
{
    auto idx = getUniformLocation(name);
    if (idx < 0) {
        // uniform undefined
        //   --> ignore set
        return;
    }

    GLfloat m[16];
    
    m[0]  = mat.aij(1,1);
    m[4]  = mat.aij(1,2);
    m[8]  = mat.aij(1,3);
    m[12] = mat.aij(1,4);
    
    m[1]  = mat.aij(2,1);
    m[5]  = mat.aij(2,2);
    m[9]  = mat.aij(2,3);
    m[13] = mat.aij(2,4);
    
    m[2]  = mat.aij(3,1);
    m[6]  = mat.aij(3,2);
    m[10] = mat.aij(3,3);
    m[14] = mat.aij(3,4);

    m[3]  = mat.aij(4,1);
    m[7]  = mat.aij(4,2);
    m[11] = mat.aij(4,3);
    m[15] = mat.aij(4,4);

    glUniformMatrix4fv(idx, 1, GL_FALSE, m);
}

void OglProgramObject::setMatrix(const LString &name, const qlib::Matrix3D &mat)
{
    auto idx = getUniformLocation(name);
    if (idx < 0) {
        // uniform undefined
        //   --> ignore set
        return;
    }

    GLfloat m[9];
    
    m[0] = mat.aij(1,1);
    m[1] = mat.aij(2,1);
    m[2] = mat.aij(3,1);

    m[3] = mat.aij(1,2);
    m[4] = mat.aij(2,2);
    m[5] = mat.aij(3,2);

    m[6] = mat.aij(1,3);
    m[7] = mat.aij(2,3);
    m[8] = mat.aij(3,3);

    glUniformMatrix3fv(idx, 1, GL_FALSE, m);
}

GLint OglProgramObject::getUniformLocation(const LString &name)
{
    // check cache
    auto it = m_uniforms.find(name);
    if (it != m_uniforms.end()) {
        return it->second;
    }
    
    GLint ul = glGetUniformLocation(m_hPO, name.c_str());
    if (ul == -1) {
        // MB_DPRINTLN("OglProgramObject> Cannot find uniform location: %s (ignored)", name.c_str());
        return -1;
    }
    
    // register to cache
    m_uniforms[name] = ul;
    
    return ul;
}

void OglProgramObject::setupViewport(gfx::DisplayContext *pdc)
{
    const Vector4D &vp = pdc->getViewport();
    glViewport(vp.x(), vp.y(), vp.z(), vp.w());
}

void OglProgramObject::updateMatricesUBO(const void *data, size_t size)
{
    createOrUpdateUBO(m_uboMatrices, 0, data, size);
}

void OglProgramObject::createOrUpdateUBO(GLuint &ubo, GLuint bindingPoint,
                                          const void *data, size_t size)
{
    if (ubo == 0) {
        glGenBuffers(1, &ubo);
        glBindBuffer(GL_UNIFORM_BUFFER, ubo);
        glBufferData(GL_UNIFORM_BUFFER, (GLsizeiptr)size, nullptr, GL_DYNAMIC_DRAW);
    }
    glBindBuffer(GL_UNIFORM_BUFFER, ubo);
    glBufferSubData(GL_UNIFORM_BUFFER, 0, (GLsizeiptr)size, data);
    glBindBufferBase(GL_UNIFORM_BUFFER, bindingPoint, ubo);
    glBindBuffer(GL_UNIFORM_BUFFER, 0);
}

void OglProgramObject::initDrawParamsUBO(size_t size)
{
    // Allocate the DrawParams UBO buffer (binding point 2).
    // Called once from each GpuPrim::init() with the appropriate size.
    if (m_uboDrawParams != 0) {
        glDeleteBuffers(1, &m_uboDrawParams);
        m_uboDrawParams = 0;
    }
    glGenBuffers(1, &m_uboDrawParams);
    glBindBuffer(GL_UNIFORM_BUFFER, m_uboDrawParams);
    glBufferData(GL_UNIFORM_BUFFER, (GLsizeiptr)size, nullptr, GL_DYNAMIC_DRAW);
    glBindBufferBase(GL_UNIFORM_BUFFER, 2, m_uboDrawParams);
    glBindBuffer(GL_UNIFORM_BUFFER, 0);
}

void OglProgramObject::updateDrawParamsUBO(const void *data, size_t size)
{
    createOrUpdateUBO(m_uboDrawParams, 2, data, size);
}

void OglProgramObject::updateFogUBO(const void *data, size_t size)
{
    createOrUpdateUBO(m_uboFog, 1, data, size);
}


#endif
