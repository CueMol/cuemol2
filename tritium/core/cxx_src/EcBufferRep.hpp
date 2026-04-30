// -*-Mode: C++;-*-
//
//  WebGL/Electron Buffer Object representation
//

#pragma once

#include <napi.h>

// #include <sysdep/sysdep.hpp>
#include <gfx/DrawElem.hpp>

namespace gfx {
class DisplayContext;
class AbstDrawAttrs;
}  // namespace gfx

namespace node_jsbr {

using gfx::AbstDrawElem;
using gfx::DrawElem;
class ElecView;

/**
 * WebGL VBO representation class
 */
class EcBufferRep : public gfx::VBORep
{
private:
    // static int convDrawMode(int nMode);
    // static int convGLConsts(int id);
    // static int convGLNorm(int id);

    qlib::uid_t m_nViewID;
    // int m_nBufID;
    // int m_nIndBufID;

    ///

    qlib::LString m_bufName;
    int m_nDrawMode;

    // buffer data
    Napi::ObjectReference m_arrayBufRef;
    size_t m_nElems;

    // index buffer data
    Napi::ObjectReference m_indexBufRef;
    size_t m_nIndexElems;

    // // material/lighting
    // bool m_bEnableLighting;

public:
    EcBufferRep() : m_nViewID(0), m_nDrawMode(-1), m_nElems(0), m_nIndexElems(0) {}

    virtual ~EcBufferRep();

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
    void bind() override;

    /** Update VBO data
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void update(const gfx::AbstDrawAttrs &ada) override;

    /** Set vertex attribute pointers
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void setAttrib(const gfx::AbstDrawAttrs &ada) override;

    /** Draw VBO
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void draw(const gfx::AbstDrawAttrs &ada) override;

    /** Unbind VBO
     * @param pdc Display context
     * @param ada Abstract drawing attributes
     */
    void unbind(const gfx::AbstDrawAttrs &ada) override;

private:
    void deleteBuffer(ElecView *pView);

};

}  // namespace node_jsbr
