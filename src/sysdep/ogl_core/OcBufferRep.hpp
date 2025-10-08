// -*-Mode: C++;-*-
//
//  OpenGL Buffer Object representation
//

#pragma once

#include <sysdep/sysdep.hpp>
#include <gfx/DrawElem.hpp>

namespace gfx {
class DisplayContext;
class AbstDrawAttrs;
}  // namespace gfx

namespace sysdep {

using gfx::AbstDrawElem;
using gfx::DrawElem;

/**
 * OpenGL VBO representation class
 */
class OcBufferRep : public gfx::VBORep
{
private:
    static GLenum convDrawMode(int nMode);
    static int convGLConsts(int id);
    static int convGLNorm(int id);

    qlib::uid_t m_nViewID;
    GLuint m_nBufID;
    GLuint m_nIndBufID;

public:
    OcBufferRep() : m_nViewID(0), m_nBufID(0), m_nIndBufID(0) {}

    /**
     * Create VBO
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void create(gfx::DisplayContext *pdc, const gfx::AbstDrawAttrs &ada);

    /** Bind VBO
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void bind();

    /** Update VBO data
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void update(const gfx::AbstDrawAttrs &ada);

    /** Set vertex attribute pointers
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void setAttrib(const gfx::AbstDrawAttrs &ada);

    /** Draw VBO
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void draw(const gfx::AbstDrawAttrs &ada);

    /** Draw VBO with instancing
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     * @param nCount Number of vertices/indices to draw
     * @param nInsts Number of instances to draw
     */
    void draw(const gfx::AbstDrawAttrs &ada, int nCount, int nInsts);

    /** Unbind VBO
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void unbind(const gfx::AbstDrawAttrs &ada);

    virtual ~OcBufferRep();
};

}  // namespace sysdep
