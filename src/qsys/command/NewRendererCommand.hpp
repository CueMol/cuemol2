#pragma once

#include <qsys/Renderer.hpp>
#include <qsys/View.hpp>
#include <qsys/qsys.hpp>

#include "Command.hpp"

namespace qsys {

using qlib::LString;

/// New renderer CLI command
class QSYS_API NewRendererCommand : public Command
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

public:
    NewRendererCommand() = default;
    ~NewRendererCommand() override = default;

    /// Execute the command
    void run() override;

    void runGUI(void *pwnd_info) override;

    /// Get command's unique name
    const char *getName() const override;

    //////////
    // properties (input)

    /// Target object
    ObjectPtr m_pTargObj;

    /// Renderer type name
    LString m_rendTypeName;

    /// Renderer name
    LString m_rendName;

    /// Recenter/Fit view flag
    bool m_bRecenView;

    /// Default style name
    LString m_styleName;

    /// Other Properties (optional)
    qlib::LVarDict m_props;

    //////////
    // properties (output)

    /// resulting new renderer
    RendererPtr m_pResRend;

};

}  // namespace qsys
