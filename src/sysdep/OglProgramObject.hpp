// -*-Mode: C++;-*-
//
//  OpenGL program object
//

#pragma once

#include "sysdep.hpp"

#ifdef HAVE_GLEW
#define GLEW_STATIC
#include <GL/glew.h>
#endif

#ifdef USE_GLES2
#include <OpenGLES/ES2/gl.h>
#include <OpenGLES/ES2/glext.h>
#endif

#if defined(HAVE_GLEW) || defined(USE_GLES2)

#include <qlib/LString.hpp>
#include <qlib/Matrix4D.hpp>
#include <gfx/ShaderObject.hpp>

namespace gfx {
class DisplayContext;
}

namespace sysdep {

using qlib::LString;

class SYSDEP_API OglShObjImpl
{
private:
    GLuint m_hGL;
    LString m_name;
    GLenum m_nType;
    LString m_source;

    static LString s_shaderVerStr;

public:
    OglShObjImpl(const GLenum shader_type) : m_nType(shader_type), m_hGL(0) {}

    virtual ~OglShObjImpl();

    void loadFile(const LString &filename);

    bool compile();

    inline GLuint getHandle() const
    {
        return m_hGL;
    }

    static void setShaderVersionString(const LString &verstr) {
        s_shaderVerStr = verstr;
    }
    static const LString &getShaderVersionString() {
        return s_shaderVerStr;
    }

};

////////////////////////////////////////

class SYSDEP_API OglProgramObject : public gfx::ShaderObject
{
private:
    GLuint m_hPO;

    using ShaderTab = std::map<LString, OglShObjImpl *>;
    ShaderTab m_shaders;

    using UniformTab = std::map<LString, GLint>;
    UniformTab m_uniforms;

public:
    OglProgramObject() : m_hPO(0) {}
    virtual ~OglProgramObject();

    bool init();

    virtual bool loadShaders(const qlib::MapTable<qlib::LString> &name) override;

    virtual void enable() override;

    virtual void disable() override;

    //////////

    bool loadShader(const LString &name, const LString &srcpath, GLenum shader_type);

    void clear();

    void attach(const OglShObjImpl *s);

    bool link();

    void validate();

    inline GLuint getHandle() const
    {
        return m_hPO;
    }

    inline void use()
    {
        enable();
    }

    GLint getUniformLocation(const LString &name);

    inline void bindAttribLocation(GLint index, const char *name)
    {
        glBindAttribLocation(m_hPO, index, name);
    }

    virtual int getAttribLocation(const char *name) override
    {
        GLint al = glGetAttribLocation(m_hPO, name);
        if (al == -1) {
            MB_DPRINTLN("Cannot find attribute location: %s", name);
        }
        return al;
    }

    // uniform variable

    // int

    virtual void setUniform(const LString &name, int v0) override
    {
        glUniform1i(getUniformLocation(name), v0);
    }

    virtual void setUniform(const LString &name, int v0, int v1) override
    {
        glUniform2i(getUniformLocation(name), v0, v1);
    }

    virtual void setUniform(const LString &name, int v0, int v1, int v2) override
    {
        glUniform3i(getUniformLocation(name), v0, v1, v2);
    }

    virtual void setUniform(const LString &name, int v0, int v1, int v2, int v3) override
    {
        glUniform4i(getUniformLocation(name), v0, v1, v2, v3);
    }

    // float

    virtual void setUniformF(const LString &name, float v0) override
    {
        glUniform1f(getUniformLocation(name), v0);
    }

    virtual void setUniformF(const LString &name, float v0, float v1) override
    {
        glUniform2f(getUniformLocation(name), v0, v1);
    }

    virtual void setUniformF(const LString &name, float v0, float v1, float v2) override
    {
        glUniform3f(getUniformLocation(name), v0, v1, v2);
    }

    virtual void setUniformF(const LString &name, float v0, float v1, float v2,
                             float v3) override
    {
        glUniform4f(getUniformLocation(name), v0, v1, v2, v3);
    }

    // int array

    inline void setUniform1iv(const LString &name, GLuint count, const GLint *v)
    {
        glUniform1iv(getUniformLocation(name), count, v);
    }

    inline void setUniform2iv(const LString &name, GLuint count, const GLint *v)
    {
        glUniform2iv(getUniformLocation(name), count, v);
    }

    inline void setUniform3iv(const LString &name, GLuint count, const GLint *v)
    {
        glUniform3iv(getUniformLocation(name), count, v);
    }

    inline void setUniform4iv(const LString &name, GLuint count, const GLint *v)
    {
        glUniform4iv(getUniformLocation(name), count, v);
    }

    // float array

    inline void setUniform1fv(const LString &name, GLuint count, const GLfloat *v)
    {
        glUniform1fv(getUniformLocation(name), count, v);
    }

    inline void setUniform2fv(const LString &name, GLuint count, const GLfloat *v)
    {
        glUniform2fv(getUniformLocation(name), count, v);
    }

    inline void setUniform3fv(const LString &name, GLuint count, const GLfloat *v)
    {
        glUniform3fv(getUniformLocation(name), count, v);
    }

    inline void setUniform4fv(const LString &name, GLuint count, const GLfloat *v)
    {
        glUniform4fv(getUniformLocation(name), count, v);
    }

    // matrix

    inline void setMatrix2fv(const LString &name, GLuint count, GLboolean transpose,
                             const GLfloat *v)
    {
        glUniformMatrix2fv(getUniformLocation(name), count, transpose, v);
    }

    inline void setMatrix3fv(const LString &name, GLuint count, GLboolean transpose,
                             const GLfloat *v)
    {
        glUniformMatrix3fv(getUniformLocation(name), count, transpose, v);
    }

    inline void setMatrix4fv(const LString &name, GLuint count, GLboolean transpose,
                             const GLfloat *v)
    {
        glUniformMatrix4fv(getUniformLocation(name), count, transpose, v);
    }

    virtual void setMatrix(const LString &name, const qlib::Matrix4D &mat) override;
    virtual void setMatrix(const LString &name, const qlib::Matrix3D &mat) override;

    // attribute variable

    // float

    inline void setAttrib1f(GLint al, GLfloat v0)
    {
        glVertexAttrib1f(al, v0);
    }

    inline void setAttrib2f(GLint al, GLfloat v0, GLfloat v1)
    {
        glVertexAttrib2f(al, v0, v1);
    }

    inline void setAttrib3f(GLint al, GLfloat v0, GLfloat v1, GLfloat v2)
    {
        glVertexAttrib3f(al, v0, v1, v2);
    }

    inline void setAttrib4f(GLint al, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3)
    {
        glVertexAttrib4f(al, v0, v1, v2, v3);
    }

    // float array

    inline void setAttrib1fv(GLint al, const GLfloat *v)
    {
        glVertexAttrib1fv(al, v);
    }

    inline void setAttrib2fv(GLint al, const GLfloat *v)
    {
        glVertexAttrib2fv(al, v);
    }

    inline void setAttrib3fv(GLint al, const GLfloat *v)
    {
        glVertexAttrib3fv(al, v);
    }

    inline void setAttrib4fv(GLint al, const GLfloat *v)
    {
        glVertexAttrib4fv(al, v);
    }

    void setProgParam(GLenum pname, GLint param);

    // convenience functions
    virtual void setupFog(gfx::DisplayContext *pdc) override;
    virtual void setupMat(gfx::DisplayContext *pdc) override;
};

}  // namespace sysdep

#endif  // #if defined(HAVE_GLEW) || defined(USE_GLES2)
