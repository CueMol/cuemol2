#include <common.h>

#include "NewRendererCommand.hpp"

#include <qlib/ObjectManager.hpp>
#include <qsys/SceneManager.hpp>

namespace qsys {

/// Execute the command
void NewRendererCommand::run()
{

    m_pResRend = m_pTargObj->createRenderer(m_rendTypeName);
    m_pResRend->setPropStr("name", m_rendName);

    if (!m_styleName.isEmpty()) {
        m_pResRend->applyStyles(m_styleName);
    }

    if (m_bRecenView) {
        auto pTargScene = m_pTargObj->getScene();
        auto pos = m_pResRend->getCenter();
        const auto &views = pTargScene->getViewTable();
        for (const auto &elem : views) {
            LOG_DPRINTLN("Set view %p (ID %d) center (%f, %f, %f)", elem.second.get(),
                         elem.second->getUID(), pos.x(), pos.y(), pos.z());
            elem.second->setViewCenter(pos);
        }
    }
}

void NewRendererCommand::runGUI(void *pwnd_info) {}

/// Get command's unique name
const char *NewRendererCommand::getName() const
{
    return "new_renderer";
}

}  // namespace qsys
