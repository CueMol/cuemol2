//
// iOS CueMol main routine
//

#ifndef __IOS_MAIN_H_INCLUDED__
#define __IOS_MAIN_H_INCLUDED__

#ifdef __cplusplus
extern "C" {
#endif

bool ios_init(const char *confpath);
void ios_fini();

#ifdef __cplusplus
}
#endif

#endif // __IOS_MAIN_H_INCLUDED__
