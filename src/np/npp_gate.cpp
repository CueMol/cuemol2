/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

////////////////////////////////////////////////////////////
//
// Implementation of plugin entry points (NPP_*)
// most are just empty stubs for this particular plugin 
//
#include <common.h>

#include "npcommon.h"

#include "np_entry.hpp"
#include "Plugin.hpp"
#include "PluginModule.hpp"

char *NPP_GetMIMEDescription(void)
{
  return "application/cuemol2-plugin:*:CueMol2 Plugin";
}

NPError NPP_Initialize(void)
{
  fprintf(stdout, "*************************** NPP_INITIALIZE CALLED!!! **\n\n");
  np::PluginModule::init();
  return NPERR_NO_ERROR;
}

void NPP_Shutdown(void)
{
  np::PluginModule::fini();
}

// here the plugin creates an instance of our CPlugin object which 
// will be associated with this newly created plugin instance and 
// will do all the neccessary job
NPError NPP_New(NPMIMEType pluginType,
                NPP instance,
                QMP_UINT16 mode,
                QMP_INT16 argc,
                char* argn[],
                char* argv[],
                NPSavedData* saved)
{   
  fprintf(stderr, "*************************** NPP_NEW CALLED!!! **\n\n");
  if(instance == NULL)
    return NPERR_INVALID_INSTANCE_ERROR;

  NPError rv = NPERR_NO_ERROR;

  np::Plugin *pPlugin = np::createPluginObj(instance);
  if(pPlugin == NULL)
    return NPERR_OUT_OF_MEMORY_ERROR;

  instance->pdata = (void *)pPlugin;

  int scid = 0;
  int vwid = 0;
  for (int i=0; i<argc; ++i) {
    LString key = argn[i];
    LString val = argv[i];
    if (key.equals("scid")) {
      val.toInt(&scid);
    }
    else if (key.equals("vwid")) {
      val.toInt(&vwid);
    }
  }

  if (scid&&vwid) {
    if (!pPlugin->bind(scid, vwid)) {
      LOG_DPRINTLN("NP> FAILED: binding by plugin arguments!!");
    }
    else {
      MB_DPRINTLN("NP> binding by plugin arguments: OK.");
    }
  }


  return rv;
}

// here is the place to clean up and destroy the CPlugin object
NPError NPP_Destroy (NPP instance, NPSavedData** save)
{
  if(instance == NULL)
    return NPERR_INVALID_INSTANCE_ERROR;

  NPError rv = NPERR_NO_ERROR;

  np::Plugin *pPlugin = (np::Plugin *)instance->pdata;
  if(pPlugin != NULL) {
    pPlugin->fini();
    delete pPlugin;
  }
  return rv;
}

// during this call we know when the plugin window is ready or
// is about to be destroyed so we can do some gui specific
// initialization and shutdown
NPError NPP_SetWindow(NPP instance, NPWindow* pNPWindow)
{    
  MB_DPRINTLN("NPP_SetWindow> instance=%p, NPWindow=%p", instance, pNPWindow);

  if(instance == NULL)
    return NPERR_INVALID_INSTANCE_ERROR;

  NPError rv = NPERR_NO_ERROR;

  if(pNPWindow == NULL)
    return NPERR_GENERIC_ERROR;

  np::Plugin *pPlugin = (np::Plugin *)instance->pdata;

  if(pPlugin == NULL) 
    return NPERR_GENERIC_ERROR;

  // window just created
  if(!pPlugin->isInitialized() && (pNPWindow->window != NULL)) { 
    if(!pPlugin->init(pNPWindow)) {
      delete pPlugin;
      pPlugin = NULL;
      return NPERR_MODULE_LOAD_FAILED_ERROR;
    }
  }

  // window goes away
  if((pNPWindow->window == NULL) && pPlugin->isInitialized()) {
    MB_DPRINTLN("  --> window goes away");
    pPlugin->setWindow(pNPWindow);
    return NPERR_NO_ERROR;
  }

  // window resized
  if(pPlugin->isInitialized() && (pNPWindow->window != NULL)) {
    MB_DPRINTLN("NPP_SetWindow (resize) > (x,y)=(%d,%d), (w,h)=(%d,%d)",
                pNPWindow->x, pNPWindow->y,
                pNPWindow->width, pNPWindow->height);
    //pPlugin->setWindow(pNPWindow);
    pPlugin->windowResized(pNPWindow);
    return NPERR_NO_ERROR;
  }

  // this should not happen, nothing to do
  if((pNPWindow->window == NULL) && !pPlugin->isInitialized())
    return NPERR_NO_ERROR;

  MB_DPRINTLN("  --> window ???");
  return rv;
}

// ==============================
// ! Scriptability related code !
// ==============================
//
// here the plugin is asked by Mozilla to tell if it is scriptable
// we should return a valid interface id and a pointer to 
// nsScriptablePeer interface which we should have implemented
// and which should be defined in the corressponding *.xpt file
// in the bin/components folder
NPError	NPP_GetValue(NPP instance, NPPVariable variable, void *value)
{
  MB_DPRINTLN("NPP_GetValue CALLED!!! inst=%p, var=%d, val=%p", instance, variable, value);

  NPError rv = NPERR_NO_ERROR;

  switch (variable) {
  case NPPVpluginNameString:
    *((char **)value) = "NPCueMol2Plugin";
    break;
  case NPPVpluginDescriptionString:
    *((char **)value) = "CueMol2 plugin";
    break;

  case NPPVpluginScriptableNPObject: {

    if(instance == NULL) {
      LOG_DPRINTLN("NPP_GetValue ERROR instance=NULL!!");
      return NPERR_INVALID_INSTANCE_ERROR;
    }

    np::Plugin * plugin = (np::Plugin *)instance->pdata;
    if(plugin == NULL)
      return NPERR_GENERIC_ERROR;


    *(NPObject **)value = plugin->getScriptableObject();
    MB_DPRINTLN("NPP_GetValue NPPVpluginScriptableNPObject %p", *(NPObject **)value);
    break;
  }
  default:
    rv = NPERR_GENERIC_ERROR;
  }

  return rv;
}

NPError NPP_NewStream(NPP instance,
                      NPMIMEType type,
                      NPStream* stream, 
                      NPBool seekable,
                      QMP_UINT16* stype)
{
  if(instance == NULL)
    return NPERR_INVALID_INSTANCE_ERROR;

  NPError rv = NPERR_NO_ERROR;
  return rv;
}

QMP_INT32 NPP_WriteReady (NPP instance, NPStream *stream)
{
  if(instance == NULL)
    return NPERR_INVALID_INSTANCE_ERROR;

  QMP_INT32 rv = 0x0fffffff;
  return rv;
}

QMP_INT32 NPP_Write (NPP instance, NPStream *stream, QMP_INT32 offset, QMP_INT32 len, void *buffer)
{   
  if(instance == NULL)
    return NPERR_INVALID_INSTANCE_ERROR;

  QMP_INT32 rv = len;
  return rv;
}

NPError NPP_DestroyStream (NPP instance, NPStream *stream, NPError reason)
{
  if(instance == NULL)
    return NPERR_INVALID_INSTANCE_ERROR;

  NPError rv = NPERR_NO_ERROR;
  return rv;
}

void NPP_StreamAsFile (NPP instance, NPStream* stream, const char* fname)
{
  if(instance == NULL)
    return;
}

void NPP_Print (NPP instance, NPPrint* printInfo)
{
  if(instance == NULL)
    return;
}

void NPP_URLNotify(NPP instance, const char* url, NPReason reason, void* notifyData)
{
  if(instance == NULL)
    return;
}

NPError NPP_SetValue(NPP instance, NPNVariable variable, void *value)
{
  if(instance == NULL)
    return NPERR_INVALID_INSTANCE_ERROR;

  NPError rv = NPERR_NO_ERROR;
  return rv;
}

QMP_INT16 NPP_HandleEvent(NPP instance, void* event)
{
  if(instance == NULL)
    return 0;

  QMP_INT16 rv = 0;
  np::Plugin * pPlugin = (np::Plugin *)instance->pdata;
  if (pPlugin)
    rv = pPlugin->handleEvent(event);

  return rv;
}

NPObject *NPP_GetScriptableInstance(NPP instance)
{
  if(!instance)
    return 0;

  NPObject *npobj = 0;
  np::Plugin * pPlugin = (np::Plugin *)instance->pdata;
  if (!pPlugin)
    npobj = pPlugin->getScriptableObject();

  return npobj;
}

///////////////////////////////////////////////////////////////////////

/**
   Setup the plugin-side entry point
 */
NPError setupPluginEntryPoint(NPPluginFuncs* pFuncs)
{
  if(pFuncs == NULL)
    return NPERR_INVALID_FUNCTABLE_ERROR;

  if(pFuncs->size < sizeof(NPPluginFuncs))
    return NPERR_INVALID_FUNCTABLE_ERROR;

  /*
   * Set up the plugin function table that Netscape will use to
   * call us.  Netscape needs to know about our version and size
   * and have a UniversalProcPointer for every function we
   * implement.
   */
  pFuncs->version    = (NP_VERSION_MAJOR << 8) + NP_VERSION_MINOR;
  pFuncs->size       = sizeof(NPPluginFuncs);
  pFuncs->newp       = NewNPP_NewProc(NPP_New);
  pFuncs->destroy    = NewNPP_DestroyProc(NPP_Destroy);
  pFuncs->setwindow  = NewNPP_SetWindowProc(NPP_SetWindow);
  pFuncs->newstream  = NewNPP_NewStreamProc(NPP_NewStream);
  pFuncs->destroystream = NewNPP_DestroyStreamProc(NPP_DestroyStream);
  pFuncs->asfile     = NewNPP_StreamAsFileProc(NPP_StreamAsFile);
  pFuncs->writeready = NewNPP_WriteReadyProc(NPP_WriteReady);
  pFuncs->write      = NewNPP_WriteProc(NPP_Write);
  pFuncs->print      = NewNPP_PrintProc(NPP_Print);
  pFuncs->event      = NewNPP_HandleEventProc(NPP_HandleEvent);
  pFuncs->urlnotify  = NewNPP_URLNotifyProc(NPP_URLNotify);
  pFuncs->getvalue   = NewNPP_GetValueProc(NPP_GetValue);
  pFuncs->setvalue   = NewNPP_SetValueProc(NPP_SetValue);
  pFuncs->javaClass  = NULL;

  return NPERR_NO_ERROR;
}

