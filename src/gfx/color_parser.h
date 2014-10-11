
/* A Bison parser, made by GNU Bison 2.4.1.  */

/* Skeleton interface for Bison's Yacc-like parsers in C
   
      Copyright (C) 1984, 1989, 1990, 2000, 2001, 2002, 2003, 2004, 2005, 2006
   Free Software Foundation, Inc.
   
   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.
   
   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.
   
   You should have received a copy of the GNU General Public License
   along with this program.  If not, see <http://www.gnu.org/licenses/>.  */

/* As a special exception, you may create a larger work that contains
   part or all of the Bison parser skeleton and distribute that work
   under terms of your choice, so long as that work isn't itself a
   parser generator using the skeleton or a modified version thereof
   as a parser skeleton.  Alternatively, if you modify or redistribute
   the parser skeleton itself, you may (at your option) remove this
   special exception, which will cause the skeleton and the resulting
   Bison output files to be licensed under the GNU General Public
   License without this special exception.
   
   This special exception was added by the Free Software Foundation in
   version 2.2 of Bison.  */


/* Tokens.  */
#ifndef YYTOKENTYPE
# define YYTOKENTYPE
   /* Put the tokens into the symbol table, so that GDB and other debuggers
      know about them.  */
   enum yytokentype {
     COL_LPAREN = 258,
     COL_RPAREN = 259,
     COL_LBRACE = 260,
     COL_RBRACE = 261,
     COL_COMMA = 262,
     COL_COLON = 263,
     COL_SEMICOLON = 264,
     COL_RGB = 265,
     COL_RGBA = 266,
     COL_HSB = 267,
     COL_HSBA = 268,
     COL_MOLCOL = 269,
     COL_NAME = 270,
     COL_MODIFVAL = 271,
     COL_INTNUM = 272,
     COL_HTML3 = 273,
     COL_HTML6 = 274,
     COL_FLOATNUM = 275,
     COL_PERCENTNUM = 276,
     COL_NULL = 277,
     LEX_ERROR = 278
   };
#endif
/* Tokens.  */
#define COL_LPAREN 258
#define COL_RPAREN 259
#define COL_LBRACE 260
#define COL_RBRACE 261
#define COL_COMMA 262
#define COL_COLON 263
#define COL_SEMICOLON 264
#define COL_RGB 265
#define COL_RGBA 266
#define COL_HSB 267
#define COL_HSBA 268
#define COL_MOLCOL 269
#define COL_NAME 270
#define COL_MODIFVAL 271
#define COL_INTNUM 272
#define COL_HTML3 273
#define COL_HTML6 274
#define COL_FLOATNUM 275
#define COL_PERCENTNUM 276
#define COL_NULL 277
#define LEX_ERROR 278




#if ! defined YYSTYPE && ! defined YYSTYPE_IS_DECLARED
typedef union YYSTYPE
{

/* Line 1676 of yacc.c  */
#line 23 "color_parser.yxx"

  int intnum;
  double floatnum;
  char *str;



/* Line 1676 of yacc.c  */
#line 106 "../../src/gfx/color_parser.h"
} YYSTYPE;
# define YYSTYPE_IS_TRIVIAL 1
# define yystype YYSTYPE /* obsolescent; will be withdrawn */
# define YYSTYPE_IS_DECLARED 1
#endif

extern YYSTYPE collval;


