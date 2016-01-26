// -*-Mode: C++;-*-
//
// Style file reader/writer class
//

#ifndef QSYS_STYLE_FILE_HPP_INCLUDED
#define QSYS_STYLE_FILE_HPP_INCLUDED

#include <qsys/qsys.hpp>

#include <gfx/gfx.hpp>
#include <gfx/Material.hpp>
#include "StyleSet.hpp"

namespace qlib {
  class PrintStream;
  class InStream;
  class OutStream;
  class LDom2Node;
}

namespace qsys {

  class StyleList;
  class StyleMgr;

  using qlib::LString;
  using qlib::LDom2Node;
  using gfx::ColorPtr;
  using gfx::Material;

  ///
  /// Style reader/writer class
  ///
  class QSYS_API StyleFile
  {
  private:
    StyleMgr *m_pTarg;

  public:
    StyleFile();

    //////////
    
    /// Load style from LDOM2 nodes
    qlib::uid_t loadNodes(LDom2Node *pRoot, qlib::uid_t scope, const LString &src, const LString &id);
    qlib::uid_t loadNodes(LDom2Node *pRoot, qlib::uid_t scope, const LString &src) {
      return loadNodes(pRoot, scope, src, LString());
    }
    qlib::uid_t loadNodes(LDom2Node *pRoot, qlib::uid_t scope) {
      return loadNodes(pRoot, scope, LString(), LString());
    }

    StyleSetPtr loadNodes(LDom2Node *pRoot, StyleSetPtr pMergeSet=StyleSetPtr());

    /// Load style from stream (in XML format)
    qlib::uid_t loadStream(qlib::InStream &ins, qlib::uid_t scope, const LString &src, const LString &id);
    qlib::uid_t loadStream(qlib::InStream &ins, qlib::uid_t scope, const LString &src) {
      return loadStream(ins, scope, src, LString());
    }

    /// Load style from local file (in XML format)
    qlib::uid_t loadFile(const LString &path, qlib::uid_t scope, const LString &id);
    qlib::uid_t loadFile(const LString &path, qlib::uid_t scope) {
      return loadFile(path, scope, LString());
    }

    //////////

    /// Save scope's style info to the LDOM2node
    void saveToNode(LDom2Node *pNode, qlib::uid_t scope, const LString &basedir);
    
  private:
    
    void loadStyle(LDom2Node *pNode, StyleSet *pSet);

    void loadPalette(LDom2Node *pNode, StyleSet *pSet);

    void loadMaterial(LDom2Node *pNode, StyleSet *pSet);

    void loadSetting(LDom2Node *pNode, StyleSet *pSet);

    /// Load arbitary string data
    void loadStrData(LDom2Node *pNode, StyleSet *pSet);

    /// Modify color by attribute modifiers
    ColorPtr procModCol(LDom2Node *pNode, const ColorPtr &pRefCol);
  };

}

#endif

