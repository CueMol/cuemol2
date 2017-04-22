// -*-Mode: C++;-*-
//
//  OpenGL program object/shader implementation
//

#include <common.h>

#include "OglProgramObject.hpp"
#include "OglError.hpp"

#include <qlib/FileStream.hpp>
#include <qlib/LineStream.hpp>
#include <qlib/LRegExpr.hpp>

#include <qsys/SysConfig.hpp>

#if defined(HAVE_GLEW) || defined(USE_GLES2)

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>

namespace fs = boost::filesystem;

using namespace sysdep;
using qsys::SysConfig;

OglShaderObject::~OglShaderObject()
{
  if (m_hGL) {
    MB_DPRINTLN("OglShader %d destroyed", m_hGL);
    //glDeleteObjectARB(m_hGL);
    glDeleteShader(m_hGL);
  }
}

void OglShaderObject::loadFile(const LString& filename, bool bUseInclude, SOMacroDefs *penv)
{
  CLR_GLERROR();
  // CHK_GLERROR("SO.loadFile createShader BEFORE");

  //m_hGL = glCreateShaderObjectARB(m_nType);
  m_hGL = glCreateShader(m_nType);
  CHK_GLERROR("SO.loadFile createShader");
  GLenum errc;
  errc = glGetError();
  if ( errc != GL_NO_ERROR ) {
    LOG_DPRINTLN("ShaderObject::ShaderObject(): cannot create shader object: %s",
                 filename.c_str());
    MB_THROW(qlib::RuntimeException, "glCreateShader error");
    return;
  }

  SysConfig *pconf = SysConfig::getInstance();
  LString fnam = pconf->convPathName(filename);

  // read source file
  m_bUseInclude = bUseInclude;
  loadFileWithInclude(fnam);

  // check supported shaderlang version

  LString verstr;
  const char *pstr = (const char *) glGetString(GL_SHADING_LANGUAGE_VERSION);
  if (pstr!=NULL) {
    LString sv(pstr);
    int dot = sv.indexOf('.');
#ifdef WIN32
    verstr = "#version "+sv.substr(0,dot) + sv.substr(dot+1, 2) + " compatibility";
#else
    verstr = "#version "+sv.substr(0,dot) + sv.substr(dot+1, 2);
#endif
  }

  MB_DPRINTLN("PO> Add version macro: %s", verstr.c_str());

  // define macro variables
  LString macstr;
  if (penv!=NULL) {
    SOMacroDefs &som = *penv;
    BOOST_FOREACH (SOMacroDefs::value_type &elem, som) {
      macstr += "#define "+(elem.first)+" "+(elem.second) +"\n";
    }
  }

  MB_DPRINTLN("PO> Add macro defs: %s", macstr.c_str());

  // set shader source

  LString linenostr("#line 1");

  m_source = verstr + "\n"
    + macstr + "\n"
      + linenostr + "\n"
        + m_source;

  const char *csrc = m_source.c_str();
  int srclen = m_source.length();

  glShaderSource( m_hGL, 1, &csrc, &srclen );
  if ( glGetError() != GL_NO_ERROR ) {
    CHK_GLERROR("SO.loadFile");
    LOG_DPRINTLN("ShaderObject::ShaderObject(): cannot set shader source: %s",
                 fnam.c_str());
    MB_THROW(qlib::RuntimeException, "glShaderSource error");
  }

  m_name = fnam;
}

void OglShaderObject::loadFileWithInclude(const LString &fname)
{
  fs::path srcpath(fname.c_str());
  fs::path ppath = srcpath.parent_path();
  m_basedir = ppath.string();
  LString ffn = srcpath.filename().string();

  m_source = loadFileWithInclImpl(ffn, 0);
}

LString OglShaderObject::loadFileWithInclImpl(const LString &fname, int nestlv)
{
  fs::path fs_dir(m_basedir.c_str());
  fs::path fs_fname(fname.c_str());
  LString fullpath( (fs_dir/fs_fname).string() );
  
  LString source;

  qlib::FileInStream fis;
  fis.open(fullpath);
  qlib::LineStream lin(fis);
  qlib::LRegExpr re_inc("^@include\\s*\"(.+)\"\\s*$");
  
  while (lin.ready()) {
    LString line = lin.readLine();
    int nline = lin.getLineNo();
    if (line.isEmpty())
      break;
    if (m_bUseInclude && nestlv<10 && re_inc.match(line)) {
      LString path = re_inc.getSubstr(1);
      MB_DPRINTLN("OglSO> process include directive %s", path.c_str());

      fs::path srcpath(path.c_str());
      LString ffn = srcpath.filename().string();

      LString sub = loadFileWithInclImpl(ffn, nestlv+1);

      source += "\n";
      source += LString::format("#line 1\n");
      source += sub;
      source += LString::format("#line %d\n", nline+1);
    }
    else {
      source += line;
    }
  }
  
  return source;
}

bool OglShaderObject::compile()
{
  int length, l;

  CLR_GLERROR();

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
  GLenum errc;

  CLR_GLERROR();

  // m_hPO = glCreateProgramObjectARB();
  m_hPO = glCreateProgram();
  errc = glGetError();

  if ( errc != GL_NO_ERROR ) {
    //LOG_DPRINTLN("ProgramObject::ProgramObject(): cannot create program object (%d; %s)",
    //errc, gluErrorString(errc));
    return false;
  }

  return true;
}

OglProgramObject::~OglProgramObject()
{
  MB_DPRINTLN("OglProgramObj %d destroyed", m_hPO);
  clear();
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

bool OglProgramObject::loadShader(const LString &name, const LString &srcpath, GLenum shader_type, SOMacroDefs *pENV /*= NULL*/)
{
  ShaderTab::const_iterator i = m_shaders.find(name);
  if (i!=m_shaders.end())
    return false;
  
  OglShaderObject *pVS = new OglShaderObject(shader_type);
  if (pVS==NULL)
    return false;

  MB_DPRINTLN("PO> Loading shader: %s", srcpath.c_str());
  pVS->loadFile(srcpath, m_bUseInclude, pENV);
  pVS->compile();
  attach(pVS);
  m_shaders.insert(ShaderTab::value_type(name, pVS));

  LOG_DPRINTLN("PO> Loading shader: %s OK", srcpath.c_str());
  return true;
}

void OglProgramObject::attach( const OglShaderObject *s )
{
  CLR_GLERROR();

  // glAttachObjectARB( m_hPO, s->getHandle());
  glAttachShader( m_hPO, s->getHandle());

  if ( glGetError() != GL_NO_ERROR ) {
    MB_THROW(qlib::RuntimeException, "glAttachShader error");
    //MB_ASSERT(false);
  }
}

bool OglProgramObject::link()
{
  int length, l;

  CLR_GLERROR();

  // link
  glLinkProgram(m_hPO);

  // get errors
  GLint result;
  glGetProgramiv(m_hPO, GL_LINK_STATUS, &result);

  if ( glGetError() != GL_NO_ERROR || result == GL_FALSE ) {
    LOG_DPRINTLN("ProgramObject.link(): cannot link program object");

    glGetProgramiv(m_hPO, GL_INFO_LOG_LENGTH, &length);
    if (length>0) {
      GLchar *info_log = new GLchar[ length ];
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
  }

  return true;
}

void OglProgramObject::use()
{
  CLR_GLERROR();

  GLuint curr;
  glGetIntegerv(GL_CURRENT_PROGRAM, (GLint*) &curr);
  
  if (curr!=0) {
    if (m_hOldPO!=0) {
      LOG_DPRINTLN("OglProg>WARNING: old program lost: %d", m_hOldPO);
    }

    m_hOldPO = curr;
  }
  
  glUseProgram(m_hPO);
  //CHK_GLERROR("PO.use");
}

void OglProgramObject::disable()
{
  if (m_hOldPO!=0) {
    glUseProgram(m_hOldPO);
    m_hOldPO = 0;
  }
  else {
    glUseProgram(0);
  }
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

void OglProgramObject::dumpSrc() const
{
#ifdef MB_DEBUG
  BOOST_FOREACH (const ShaderTab::value_type &elem, m_shaders) {
    MB_DPRINTLN("Shader %s:", elem.first.c_str());
    elem.second->dumpSrc();
  }
#endif
}

void OglProgramObject::setProgParam(GLenum pname, GLint param)
{
#ifndef USE_GLES2
  CLR_GLERROR();
  glProgramParameteri(m_hPO, pname, param);
  CHK_GLERROR("PO.setProgParam");
#endif
}

void OglProgramObject::setMatrix(const char *name, const qlib::Matrix4D &mat)
{
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

  setMatrix4fv(name, 1, GL_FALSE, m);
}

/*
void OglProgramObject::setMatrix(const char *name, GLuint count, GLboolean transpose,
                    const GLfloat *v)
{

  glLoadMatrixd(m);
*/

#endif
