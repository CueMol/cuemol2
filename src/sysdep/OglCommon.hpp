#pragma once

#if defined(_WIN32)
#define NOMINMAX  // prevent Windows min/max macros before glew.h includes windows.h
#endif

#ifdef HAVE_GL_GLEW_H
#define GLEW_STATIC
#include <GL/glew.h>
#endif

#if defined(_WIN32)
#include <windows.h>
#endif

#ifdef HAVE_GL_GL_H
#include <GL/gl.h>
#elif defined(HAVE_OPENGL_GL_H)
#include <OpenGL/gl.h>
#else
#error no gl.h
#endif

#ifdef HAVE_GL_GLU_H
#include <GL/glu.h>
#elif defined(HAVE_OPENGL_GLU_H)
#include <OpenGL/glu.h>
#else
#error no glu.h
#endif
