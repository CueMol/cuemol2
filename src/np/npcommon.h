//
// NP module common include file
//

#ifndef NP_COMMON_H_INCLUDED_
#define NP_COMMON_H_INCLUDED_

#ifdef WIN32
# include <windows.h>
#endif

#include <npapi.h>
#include <npruntime.h>

#if (NP_VERSION_MINOR<22)

#include <npupp.h>
#define QMP_INT32 int32
#define QMP_UINT32 uint32
#define QMP_INT16 int16
#define QMP_UINT16 uint16

#else

#include <npfunctions.h>
#include <npruntime.h>

#define NewNPP_NewProc(FUNC) (FUNC)
#define NewNPP_DestroyProc(FUNC) (FUNC)
#define NewNPP_SetWindowProc(FUNC) (FUNC)
#define NewNPP_NewStreamProc(FUNC) (FUNC)
#define NewNPP_DestroyStreamProc(FUNC) (FUNC)
#define NewNPP_WriteReadyProc(FUNC) (FUNC)
#define NewNPP_WriteProc(FUNC) (FUNC)
#define NewNPP_StreamAsFileProc(FUNC) (FUNC)
#define NewNPP_PrintProc(FUNC) (FUNC)
#define NewNPP_HandleEventProc(FUNC) (FUNC)
#define NewNPP_URLNotifyProc(FUNC) (FUNC)
#define NewNPP_GetValueProc(FUNC) (FUNC)
#define NewNPP_SetValueProc(FUNC) (FUNC)
#define QMP_INT32 int32_t
#define QMP_UINT32 uint32_t
#define QMP_INT16 int16_t
#define QMP_UINT16 uint16_t

#endif


#endif // NP_COMMON_H_INCLUDED_

