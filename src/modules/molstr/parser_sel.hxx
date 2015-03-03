/* A Bison parser, made by GNU Bison 2.5.1.  */

/* Bison interface for Yacc-like parsers in C
   
      Copyright (C) 1984, 1989-1990, 2000-2012 Free Software Foundation, Inc.
   
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
     SELECTION = 258,
     SEL_AID = 259,
     SEL_ELEM = 260,
     SEL_ANAME = 261,
     SEL_ALTCONF = 262,
     SEL_RESN = 263,
     SEL_RESI = 264,
     SEL_CHAIN = 265,
     SEL_RPROP = 266,
     SEL_APROP = 267,
     SEL_BFAC = 268,
     SEL_OCC = 269,
     SEL_ALL = 270,
     SEL_NONE = 271,
     SEL_LPAREN = 272,
     SEL_RPAREN = 273,
     SEL_LBRACK = 274,
     SEL_RBRACK = 275,
     SEL_SLASH = 276,
     SEL_DOT = 277,
     SEL_COMMA = 278,
     SEL_COLON = 279,
     SEL_AND = 280,
     SEL_OR = 281,
     SEL_NOT = 282,
     SEL_EQ = 283,
     SEL_GT = 284,
     SEL_LT = 285,
     SEL_AROUND = 286,
     SEL_EXPAND = 287,
     SEL_BYRES = 288,
     SEL_BYMAINCH = 289,
     SEL_BYSIDECH = 290,
     SEL_NBR = 291,
     SEL_EXTEND = 292,
     SEL_STRING = 293,
     SEL_QSTR = 294,
     SEL_DQSTR = 295,
     SEL_REGEXP = 296,
     SEL_INSRES = 297,
     SEL_INTNUM = 298,
     SEL_FLOATNUM = 299,
     SEL_NULL = 300,
     LEX_ERROR = 301
   };
#endif
/* Tokens.  */
#define SELECTION 258
#define SEL_AID 259
#define SEL_ELEM 260
#define SEL_ANAME 261
#define SEL_ALTCONF 262
#define SEL_RESN 263
#define SEL_RESI 264
#define SEL_CHAIN 265
#define SEL_RPROP 266
#define SEL_APROP 267
#define SEL_BFAC 268
#define SEL_OCC 269
#define SEL_ALL 270
#define SEL_NONE 271
#define SEL_LPAREN 272
#define SEL_RPAREN 273
#define SEL_LBRACK 274
#define SEL_RBRACK 275
#define SEL_SLASH 276
#define SEL_DOT 277
#define SEL_COMMA 278
#define SEL_COLON 279
#define SEL_AND 280
#define SEL_OR 281
#define SEL_NOT 282
#define SEL_EQ 283
#define SEL_GT 284
#define SEL_LT 285
#define SEL_AROUND 286
#define SEL_EXPAND 287
#define SEL_BYRES 288
#define SEL_BYMAINCH 289
#define SEL_BYSIDECH 290
#define SEL_NBR 291
#define SEL_EXTEND 292
#define SEL_STRING 293
#define SEL_QSTR 294
#define SEL_DQSTR 295
#define SEL_REGEXP 296
#define SEL_INSRES 297
#define SEL_INTNUM 298
#define SEL_FLOATNUM 299
#define SEL_NULL 300
#define LEX_ERROR 301




#if ! defined YYSTYPE && ! defined YYSTYPE_IS_DECLARED
typedef union YYSTYPE
{

/* Line 2072 of yacc.c  */
#line 23 "../../../src/modules/molstr/parser_sel.yxx"

  molstr::SelSuperNode *seltok;
  int intnum;
  double floatnum;
  char *str;
  struct {
    int start; int end;
    char cstart; char cend;
  } intrng;
  struct {
    int intnum;
    char inscode;
  } insres;



/* Line 2072 of yacc.c  */
#line 159 "../../../src/modules/molstr/parser_sel.hxx"
} YYSTYPE;
# define YYSTYPE_IS_TRIVIAL 1
# define yystype YYSTYPE /* obsolescent; will be withdrawn */
# define YYSTYPE_IS_DECLARED 1
#endif

extern YYSTYPE yylval;


