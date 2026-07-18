// -*-Mode: C++;-*-
//
// Image scene output class
//

#ifndef PNG_SCENE_EXPORTER_HPP_INCLUDED_
#define PNG_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include "ImgSceneExporter.hpp"

class PngSceneExporter_wrap;

namespace qlib {
  class FileOutStream;
}

namespace render {

class RENDER_API PngSceneExporter : public ImgSceneExporter
{
  MC_SCRIPTABLE;

  friend class ::PngSceneExporter_wrap;
  typedef ImgSceneExporter super_t;

private:
  
  void *m_pPNG;
  void *m_pPNGInfo;

  bool m_bIntrl;
  int m_nCompLev;

public:
  PngSceneExporter();
  ~PngSceneExporter() override;

  /////////////////////////////////

  /// Get name of the writer
  const char *getName() const override;

  /// Get file-type description
  const char *getTypeDescr() const override;

  /// Get file extension
  const char *getFileExt() const override;

  ////////////////////////////////////////

  int prepare(const char *filename) override;
  // virtual bool request(int &posx, int &posy, int &width, int &height);
  void writeData(const char *pbuf, int nsize) override;
  void completed() override;

};

}

#endif

