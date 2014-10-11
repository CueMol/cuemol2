
/* A Bison parser, made by GNU Bison 2.4.1.  */

/* Skeleton implementation for Bison's Yacc-like parsers in C
   
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

/* C LALR(1) parser skeleton written by Richard Stallman, by
   simplifying the original so-called "semantic" parser.  */

/* All symbols defined below should begin with yy or YY, to avoid
   infringing on user name space.  This should be done even for local
   variables, as they might otherwise be expanded by user macros.
   There are some unavoidable exceptions within include files to
   define necessary library symbols; they are noted "INFRINGES ON
   USER NAME SPACE" below.  */

/* Identify Bison output.  */
#define YYBISON 1

/* Bison version.  */
#define YYBISON_VERSION "2.4.1"

/* Skeleton name.  */
#define YYSKELETON_NAME "yacc.c"

/* Pure parsers.  */
#define YYPURE 0

/* Push parsers.  */
#define YYPUSH 0

/* Pull parsers.  */
#define YYPULL 1

/* Using locations.  */
#define YYLSP_NEEDED 0



/* Copy the first part of user declarations.  */

/* Line 189 of yacc.c  */
#line 5 "parser_sel.yxx"

#include <common.h>

#include <qlib/LChar.hpp>

#include "SelCompiler.hpp"
#include "SelNodes.hpp"

extern int yylex();
extern int yyerror(char* error);

using namespace molstr;
using qlib::LChar;

#define YYDEBUG 0



/* Line 189 of yacc.c  */
#line 92 "../../../src/modules/molstr/parser_sel.cxx"

/* Enabling traces.  */
#ifndef YYDEBUG
# define YYDEBUG 0
#endif

/* Enabling verbose error messages.  */
#ifdef YYERROR_VERBOSE
# undef YYERROR_VERBOSE
# define YYERROR_VERBOSE 1
#else
# define YYERROR_VERBOSE 0
#endif

/* Enabling the token table.  */
#ifndef YYTOKEN_TABLE
# define YYTOKEN_TABLE 0
#endif


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
     SEL_REGEXP = 294,
     SEL_INSRES = 295,
     SEL_INTNUM = 296,
     SEL_FLOATNUM = 297,
     SEL_NULL = 298,
     LEX_ERROR = 299
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
#define SEL_REGEXP 294
#define SEL_INSRES 295
#define SEL_INTNUM 296
#define SEL_FLOATNUM 297
#define SEL_NULL 298
#define LEX_ERROR 299




#if ! defined YYSTYPE && ! defined YYSTYPE_IS_DECLARED
typedef union YYSTYPE
{

/* Line 214 of yacc.c  */
#line 23 "parser_sel.yxx"

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



/* Line 214 of yacc.c  */
#line 233 "../../../src/modules/molstr/parser_sel.cxx"
} YYSTYPE;
# define YYSTYPE_IS_TRIVIAL 1
# define yystype YYSTYPE /* obsolescent; will be withdrawn */
# define YYSTYPE_IS_DECLARED 1
#endif


/* Copy the second part of user declarations.  */


/* Line 264 of yacc.c  */
#line 245 "../../../src/modules/molstr/parser_sel.cxx"

#ifdef short
# undef short
#endif

#ifdef YYTYPE_UINT8
typedef YYTYPE_UINT8 yytype_uint8;
#else
typedef unsigned char yytype_uint8;
#endif

#ifdef YYTYPE_INT8
typedef YYTYPE_INT8 yytype_int8;
#elif (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
typedef signed char yytype_int8;
#else
typedef short int yytype_int8;
#endif

#ifdef YYTYPE_UINT16
typedef YYTYPE_UINT16 yytype_uint16;
#else
typedef unsigned short int yytype_uint16;
#endif

#ifdef YYTYPE_INT16
typedef YYTYPE_INT16 yytype_int16;
#else
typedef short int yytype_int16;
#endif

#ifndef YYSIZE_T
# ifdef __SIZE_TYPE__
#  define YYSIZE_T __SIZE_TYPE__
# elif defined size_t
#  define YYSIZE_T size_t
# elif ! defined YYSIZE_T && (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
#  include <stddef.h> /* INFRINGES ON USER NAME SPACE */
#  define YYSIZE_T size_t
# else
#  define YYSIZE_T unsigned int
# endif
#endif

#define YYSIZE_MAXIMUM ((YYSIZE_T) -1)

#ifndef YY_
# if YYENABLE_NLS
#  if ENABLE_NLS
#   include <libintl.h> /* INFRINGES ON USER NAME SPACE */
#   define YY_(msgid) dgettext ("bison-runtime", msgid)
#  endif
# endif
# ifndef YY_
#  define YY_(msgid) msgid
# endif
#endif

/* Suppress unused-variable warnings by "using" E.  */
#if ! defined lint || defined __GNUC__
# define YYUSE(e) ((void) (e))
#else
# define YYUSE(e) /* empty */
#endif

/* Identity function, used to suppress warnings about constant conditions.  */
#ifndef lint
# define YYID(n) (n)
#else
#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
static int
YYID (int yyi)
#else
static int
YYID (yyi)
    int yyi;
#endif
{
  return yyi;
}
#endif

#if ! defined yyoverflow || YYERROR_VERBOSE

/* The parser invokes alloca or malloc; define the necessary symbols.  */

# ifdef YYSTACK_USE_ALLOCA
#  if YYSTACK_USE_ALLOCA
#   ifdef __GNUC__
#    define YYSTACK_ALLOC __builtin_alloca
#   elif defined __BUILTIN_VA_ARG_INCR
#    include <alloca.h> /* INFRINGES ON USER NAME SPACE */
#   elif defined _AIX
#    define YYSTACK_ALLOC __alloca
#   elif defined _MSC_VER
#    include <malloc.h> /* INFRINGES ON USER NAME SPACE */
#    define alloca _alloca
#   else
#    define YYSTACK_ALLOC alloca
#    if ! defined _ALLOCA_H && ! defined _STDLIB_H && (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
#     include <stdlib.h> /* INFRINGES ON USER NAME SPACE */
#     ifndef _STDLIB_H
#      define _STDLIB_H 1
#     endif
#    endif
#   endif
#  endif
# endif

# ifdef YYSTACK_ALLOC
   /* Pacify GCC's `empty if-body' warning.  */
#  define YYSTACK_FREE(Ptr) do { /* empty */; } while (YYID (0))
#  ifndef YYSTACK_ALLOC_MAXIMUM
    /* The OS might guarantee only one guard page at the bottom of the stack,
       and a page size can be as small as 4096 bytes.  So we cannot safely
       invoke alloca (N) if N exceeds 4096.  Use a slightly smaller number
       to allow for a few compiler-allocated temporary stack slots.  */
#   define YYSTACK_ALLOC_MAXIMUM 4032 /* reasonable circa 2006 */
#  endif
# else
#  define YYSTACK_ALLOC YYMALLOC
#  define YYSTACK_FREE YYFREE
#  ifndef YYSTACK_ALLOC_MAXIMUM
#   define YYSTACK_ALLOC_MAXIMUM YYSIZE_MAXIMUM
#  endif
#  if (defined __cplusplus && ! defined _STDLIB_H \
       && ! ((defined YYMALLOC || defined malloc) \
	     && (defined YYFREE || defined free)))
#   include <stdlib.h> /* INFRINGES ON USER NAME SPACE */
#   ifndef _STDLIB_H
#    define _STDLIB_H 1
#   endif
#  endif
#  ifndef YYMALLOC
#   define YYMALLOC malloc
#   if ! defined malloc && ! defined _STDLIB_H && (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
void *malloc (YYSIZE_T); /* INFRINGES ON USER NAME SPACE */
#   endif
#  endif
#  ifndef YYFREE
#   define YYFREE free
#   if ! defined free && ! defined _STDLIB_H && (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
void free (void *); /* INFRINGES ON USER NAME SPACE */
#   endif
#  endif
# endif
#endif /* ! defined yyoverflow || YYERROR_VERBOSE */


#if (! defined yyoverflow \
     && (! defined __cplusplus \
	 || (defined YYSTYPE_IS_TRIVIAL && YYSTYPE_IS_TRIVIAL)))

/* A type that is properly aligned for any stack member.  */
union yyalloc
{
  yytype_int16 yyss_alloc;
  YYSTYPE yyvs_alloc;
};

/* The size of the maximum gap between one aligned stack and the next.  */
# define YYSTACK_GAP_MAXIMUM (sizeof (union yyalloc) - 1)

/* The size of an array large to enough to hold all stacks, each with
   N elements.  */
# define YYSTACK_BYTES(N) \
     ((N) * (sizeof (yytype_int16) + sizeof (YYSTYPE)) \
      + YYSTACK_GAP_MAXIMUM)

/* Copy COUNT objects from FROM to TO.  The source and destination do
   not overlap.  */
# ifndef YYCOPY
#  if defined __GNUC__ && 1 < __GNUC__
#   define YYCOPY(To, From, Count) \
      __builtin_memcpy (To, From, (Count) * sizeof (*(From)))
#  else
#   define YYCOPY(To, From, Count)		\
      do					\
	{					\
	  YYSIZE_T yyi;				\
	  for (yyi = 0; yyi < (Count); yyi++)	\
	    (To)[yyi] = (From)[yyi];		\
	}					\
      while (YYID (0))
#  endif
# endif

/* Relocate STACK from its old location to the new one.  The
   local variables YYSIZE and YYSTACKSIZE give the old and new number of
   elements in the stack, and YYPTR gives the new location of the
   stack.  Advance YYPTR to a properly aligned location for the next
   stack.  */
# define YYSTACK_RELOCATE(Stack_alloc, Stack)				\
    do									\
      {									\
	YYSIZE_T yynewbytes;						\
	YYCOPY (&yyptr->Stack_alloc, Stack, yysize);			\
	Stack = &yyptr->Stack_alloc;					\
	yynewbytes = yystacksize * sizeof (*Stack) + YYSTACK_GAP_MAXIMUM; \
	yyptr += yynewbytes / sizeof (*yyptr);				\
      }									\
    while (YYID (0))

#endif

/* YYFINAL -- State number of the termination state.  */
#define YYFINAL  53
/* YYLAST -- Last index in YYTABLE.  */
#define YYLAST   108

/* YYNTOKENS -- Number of terminals.  */
#define YYNTOKENS  45
/* YYNNTS -- Number of nonterminals.  */
#define YYNNTS  17
/* YYNRULES -- Number of rules.  */
#define YYNRULES  61
/* YYNRULES -- Number of states.  */
#define YYNSTATES  100

/* YYTRANSLATE(YYLEX) -- Bison symbol number corresponding to YYLEX.  */
#define YYUNDEFTOK  2
#define YYMAXUTOK   299

#define YYTRANSLATE(YYX)						\
  ((unsigned int) (YYX) <= YYMAXUTOK ? yytranslate[YYX] : YYUNDEFTOK)

/* YYTRANSLATE[YYLEX] -- Bison symbol number corresponding to YYLEX.  */
static const yytype_uint8 yytranslate[] =
{
       0,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     2,     2,     2,     2,
       2,     2,     2,     2,     2,     2,     1,     2,     3,     4,
       5,     6,     7,     8,     9,    10,    11,    12,    13,    14,
      15,    16,    17,    18,    19,    20,    21,    22,    23,    24,
      25,    26,    27,    28,    29,    30,    31,    32,    33,    34,
      35,    36,    37,    38,    39,    40,    41,    42,    43,    44
};

#if YYDEBUG
/* YYPRHS[YYN] -- Index of the first RHS symbol of rule number YYN in
   YYRHS.  */
static const yytype_uint8 yyprhs[] =
{
       0,     0,     3,     5,     9,    13,    16,    20,    27,    31,
      35,    39,    42,    45,    48,    52,    54,    56,    58,    60,
      63,    66,    69,    72,    75,    78,    81,    82,    87,    88,
      93,    98,   100,   102,   105,   109,   111,   113,   115,   119,
     121,   127,   129,   131,   133,   135,   137,   139,   141,   143,
     145,   147,   149,   151,   155,   157,   161,   163,   165,   169,
     173,   177
};

/* YYRHS -- A `-1'-separated list of the rules' RHS.  */
static const yytype_int8 yyrhs[] =
{
      46,     0,    -1,    47,    -1,    47,    25,    47,    -1,    47,
      26,    47,    -1,    27,    47,    -1,    47,    31,    58,    -1,
      47,    31,    19,    38,    20,    58,    -1,    47,    32,    58,
      -1,    47,    36,    58,    -1,    47,    37,    58,    -1,    33,
      47,    -1,    34,    47,    -1,    35,    47,    -1,    17,    47,
      18,    -1,    48,    -1,    38,    -1,    15,    -1,    16,    -1,
       5,    52,    -1,     6,    52,    -1,     7,    52,    -1,     8,
      52,    -1,     9,    60,    -1,    10,    52,    -1,     4,    59,
      -1,    -1,    13,    57,    49,    58,    -1,    -1,    14,    57,
      50,    58,    -1,    11,    51,    28,    51,    -1,    53,    -1,
      38,    -1,    38,    24,    -1,    38,    24,    38,    -1,    43,
      -1,    41,    -1,    51,    -1,    52,    23,    51,    -1,    39,
      -1,    54,    22,    55,    22,    56,    -1,    15,    -1,    52,
      -1,    15,    -1,    60,    -1,    15,    -1,    52,    -1,    28,
      -1,    30,    -1,    29,    -1,    41,    -1,    42,    -1,    61,
      -1,    59,    23,    61,    -1,    61,    -1,    60,    23,    61,
      -1,    41,    -1,    40,    -1,    41,    24,    41,    -1,    40,
      24,    41,    -1,    41,    24,    40,    -1,    40,    24,    40,
      -1
};

/* YYRLINE[YYN] -- source line where rule number YYN was defined.  */
static const yytype_uint16 yyrline[] =
{
       0,   113,   113,   123,   128,   133,   138,   146,   155,   162,
     169,   176,   180,   184,   188,   189,   192,   203,   205,   207,
     213,   219,   225,   231,   236,   241,   246,   246,   251,   251,
     256,   261,   264,   265,   272,   281,   286,   294,   300,   306,
     316,   326,   327,   330,   331,   334,   335,   340,   341,   342,
     345,   349,   355,   360,   369,   374,   382,   387,   392,   398,
     405,   412
};
#endif

#if YYDEBUG || YYERROR_VERBOSE || YYTOKEN_TABLE
/* YYTNAME[SYMBOL-NUM] -- String name of the symbol SYMBOL-NUM.
   First, the terminals, then, starting at YYNTOKENS, nonterminals.  */
static const char *const yytname[] =
{
  "$end", "error", "$undefined", "SELECTION", "SEL_AID", "SEL_ELEM",
  "SEL_ANAME", "SEL_ALTCONF", "SEL_RESN", "SEL_RESI", "SEL_CHAIN",
  "SEL_RPROP", "SEL_APROP", "SEL_BFAC", "SEL_OCC", "SEL_ALL", "SEL_NONE",
  "SEL_LPAREN", "SEL_RPAREN", "SEL_LBRACK", "SEL_RBRACK", "SEL_SLASH",
  "SEL_DOT", "SEL_COMMA", "SEL_COLON", "SEL_AND", "SEL_OR", "SEL_NOT",
  "SEL_EQ", "SEL_GT", "SEL_LT", "SEL_AROUND", "SEL_EXPAND", "SEL_BYRES",
  "SEL_BYMAINCH", "SEL_BYSIDECH", "SEL_NBR", "SEL_EXTEND", "SEL_STRING",
  "SEL_REGEXP", "SEL_INSRES", "SEL_INTNUM", "SEL_FLOATNUM", "SEL_NULL",
  "LEX_ERROR", "$accept", "start", "select_terms", "select_term", "$@1",
  "$@2", "sel_name", "sel_name_list", "sel_hierar", "selh_chexpr",
  "selh_resexpr", "selh_atmexpr", "sel_compop", "sel_number", "sel_ranges",
  "sel_resid_ranges", "sel_range", 0
};
#endif

# ifdef YYPRINT
/* YYTOKNUM[YYLEX-NUM] -- Internal token number corresponding to
   token YYLEX-NUM.  */
static const yytype_uint16 yytoknum[] =
{
       0,   256,   257,   258,   259,   260,   261,   262,   263,   264,
     265,   266,   267,   268,   269,   270,   271,   272,   273,   274,
     275,   276,   277,   278,   279,   280,   281,   282,   283,   284,
     285,   286,   287,   288,   289,   290,   291,   292,   293,   294,
     295,   296,   297,   298,   299
};
# endif

/* YYR1[YYN] -- Symbol number of symbol that rule YYN derives.  */
static const yytype_uint8 yyr1[] =
{
       0,    45,    46,    47,    47,    47,    47,    47,    47,    47,
      47,    47,    47,    47,    47,    47,    48,    48,    48,    48,
      48,    48,    48,    48,    48,    48,    49,    48,    50,    48,
      48,    48,    51,    51,    51,    51,    51,    52,    52,    52,
      53,    54,    54,    55,    55,    56,    56,    57,    57,    57,
      58,    58,    59,    59,    60,    60,    61,    61,    61,    61,
      61,    61
};

/* YYR2[YYN] -- Number of symbols composing right hand side of rule YYN.  */
static const yytype_uint8 yyr2[] =
{
       0,     2,     1,     3,     3,     2,     3,     6,     3,     3,
       3,     2,     2,     2,     3,     1,     1,     1,     1,     2,
       2,     2,     2,     2,     2,     2,     0,     4,     0,     4,
       4,     1,     1,     2,     3,     1,     1,     1,     3,     1,
       5,     1,     1,     1,     1,     1,     1,     1,     1,     1,
       1,     1,     1,     3,     1,     3,     1,     1,     3,     3,
       3,     3
};

/* YYDEFACT[STATE-NAME] -- Default rule to reduce with in state
   STATE-NUM when YYTABLE doesn't specify something else to do.  Zero
   means the default is an error.  */
static const yytype_uint8 yydefact[] =
{
       0,     0,     0,     0,     0,     0,     0,     0,     0,     0,
       0,    17,    18,     0,     0,     0,     0,     0,    16,    39,
      36,    35,     0,     2,    15,    37,    42,    31,     0,    57,
      56,    25,    52,    32,    19,    20,    21,    22,    23,    54,
      24,     0,    47,    49,    48,    26,    28,     0,     5,    11,
      12,    13,    33,     1,     0,     0,     0,     0,     0,     0,
       0,     0,     0,     0,     0,     0,     0,     0,     0,    14,
      34,     3,     4,     0,    50,    51,     6,     8,     9,    10,
      38,    43,     0,    44,    61,    59,    60,    58,    53,    55,
      30,    27,    29,     0,     0,     0,    45,    46,    40,     7
};

/* YYDEFGOTO[NTERM-NUM].  */
static const yytype_int8 yydefgoto[] =
{
      -1,    22,    23,    24,    67,    68,    25,    26,    27,    28,
      82,    98,    45,    76,    31,    38,    39
};

/* YYPACT[STATE-NUM] -- Index in YYTABLE of the portion describing
   STATE-NUM.  */
#define YYPACT_NINF -27
static const yytype_int8 yypact[] =
{
      13,    46,    50,    50,    50,    50,    46,    50,    56,   -14,
     -14,   -16,   -27,    13,    13,    13,    13,    13,    21,   -27,
     -27,   -27,    25,    45,   -27,   -27,    14,   -27,    17,    29,
      31,    38,   -27,    51,    14,    14,    14,    14,    49,   -27,
      14,    55,   -27,   -27,   -27,   -27,   -27,    48,   -27,    45,
      45,    45,    40,   -27,    13,    13,    -6,    54,    54,    54,
      56,    23,    60,    62,    46,    46,    56,    54,    54,   -27,
     -27,   -27,    65,    66,   -27,   -27,   -27,   -27,   -27,   -27,
     -27,   -27,    76,    49,   -27,   -27,   -27,   -27,   -27,   -27,
     -27,   -27,   -27,    85,    19,    54,   -27,    14,   -27,   -27
};

/* YYPGOTO[NTERM-NUM].  */
static const yytype_int8 yypgoto[] =
{
     -27,   -27,    -5,   -27,   -27,   -27,    -1,    -2,   -27,   -27,
     -27,   -27,    96,   -26,   -27,    47,     3
};

/* YYTABLE[YYPACT[STATE-NUM]].  What to do in state STATE-NUM.  If
   positive, shift that token.  If negative, reduce the rule which
   number is the opposite.  If zero, do what YYDEFACT says.
   If YYTABLE_NINF, syntax error.  */
#define YYTABLE_NINF -42
static const yytype_int8 yytable[] =
{
      34,    35,    36,    37,    32,    40,   -41,    41,    47,    48,
      49,    50,    51,    73,    42,    43,    44,     1,     2,     3,
       4,     5,     6,     7,     8,    53,     9,    10,    11,    12,
      13,    77,    78,    79,    96,    74,    75,    60,    81,    61,
      14,    91,    92,   -32,   -32,    52,    15,    16,    17,    71,
      72,    18,    19,    62,    20,    63,    21,    33,    19,    80,
      20,    64,    21,    29,    30,    90,    69,    88,    89,    99,
      54,    55,    65,    54,    55,    52,    56,    57,    70,    56,
      57,    58,    59,    66,    58,    59,    29,    30,    33,    19,
      54,    20,    97,    21,    33,    74,    75,    20,    94,    21,
      84,    85,    86,    87,    93,    95,    46,     0,    83
};

static const yytype_int8 yycheck[] =
{
       2,     3,     4,     5,     1,     7,    22,     8,    13,    14,
      15,    16,    17,    19,    28,    29,    30,     4,     5,     6,
       7,     8,     9,    10,    11,     0,    13,    14,    15,    16,
      17,    57,    58,    59,    15,    41,    42,    23,    15,    22,
      27,    67,    68,    22,    23,    24,    33,    34,    35,    54,
      55,    38,    39,    24,    41,    24,    43,    38,    39,    60,
      41,    23,    43,    40,    41,    66,    18,    64,    65,    95,
      25,    26,    23,    25,    26,    24,    31,    32,    38,    31,
      32,    36,    37,    28,    36,    37,    40,    41,    38,    39,
      25,    41,    94,    43,    38,    41,    42,    41,    22,    43,
      40,    41,    40,    41,    38,    20,    10,    -1,    61
};

/* YYSTOS[STATE-NUM] -- The (internal number of the) accessing
   symbol of state STATE-NUM.  */
static const yytype_uint8 yystos[] =
{
       0,     4,     5,     6,     7,     8,     9,    10,    11,    13,
      14,    15,    16,    17,    27,    33,    34,    35,    38,    39,
      41,    43,    46,    47,    48,    51,    52,    53,    54,    40,
      41,    59,    61,    38,    52,    52,    52,    52,    60,    61,
      52,    51,    28,    29,    30,    57,    57,    47,    47,    47,
      47,    47,    24,     0,    25,    26,    31,    32,    36,    37,
      23,    22,    24,    24,    23,    23,    28,    49,    50,    18,
      38,    47,    47,    19,    41,    42,    58,    58,    58,    58,
      51,    15,    55,    60,    40,    41,    40,    41,    61,    61,
      51,    58,    58,    38,    22,    20,    15,    52,    56,    58
};

#define yyerrok		(yyerrstatus = 0)
#define yyclearin	(yychar = YYEMPTY)
#define YYEMPTY		(-2)
#define YYEOF		0

#define YYACCEPT	goto yyacceptlab
#define YYABORT		goto yyabortlab
#define YYERROR		goto yyerrorlab


/* Like YYERROR except do call yyerror.  This remains here temporarily
   to ease the transition to the new meaning of YYERROR, for GCC.
   Once GCC version 2 has supplanted version 1, this can go.  */

#define YYFAIL		goto yyerrlab

#define YYRECOVERING()  (!!yyerrstatus)

#define YYBACKUP(Token, Value)					\
do								\
  if (yychar == YYEMPTY && yylen == 1)				\
    {								\
      yychar = (Token);						\
      yylval = (Value);						\
      yytoken = YYTRANSLATE (yychar);				\
      YYPOPSTACK (1);						\
      goto yybackup;						\
    }								\
  else								\
    {								\
      yyerror (YY_("syntax error: cannot back up")); \
      YYERROR;							\
    }								\
while (YYID (0))


#define YYTERROR	1
#define YYERRCODE	256


/* YYLLOC_DEFAULT -- Set CURRENT to span from RHS[1] to RHS[N].
   If N is 0, then set CURRENT to the empty location which ends
   the previous symbol: RHS[0] (always defined).  */

#define YYRHSLOC(Rhs, K) ((Rhs)[K])
#ifndef YYLLOC_DEFAULT
# define YYLLOC_DEFAULT(Current, Rhs, N)				\
    do									\
      if (YYID (N))                                                    \
	{								\
	  (Current).first_line   = YYRHSLOC (Rhs, 1).first_line;	\
	  (Current).first_column = YYRHSLOC (Rhs, 1).first_column;	\
	  (Current).last_line    = YYRHSLOC (Rhs, N).last_line;		\
	  (Current).last_column  = YYRHSLOC (Rhs, N).last_column;	\
	}								\
      else								\
	{								\
	  (Current).first_line   = (Current).last_line   =		\
	    YYRHSLOC (Rhs, 0).last_line;				\
	  (Current).first_column = (Current).last_column =		\
	    YYRHSLOC (Rhs, 0).last_column;				\
	}								\
    while (YYID (0))
#endif


/* YY_LOCATION_PRINT -- Print the location on the stream.
   This macro was not mandated originally: define only if we know
   we won't break user code: when these are the locations we know.  */

#ifndef YY_LOCATION_PRINT
# if YYLTYPE_IS_TRIVIAL
#  define YY_LOCATION_PRINT(File, Loc)			\
     fprintf (File, "%d.%d-%d.%d",			\
	      (Loc).first_line, (Loc).first_column,	\
	      (Loc).last_line,  (Loc).last_column)
# else
#  define YY_LOCATION_PRINT(File, Loc) ((void) 0)
# endif
#endif


/* YYLEX -- calling `yylex' with the right arguments.  */

#ifdef YYLEX_PARAM
# define YYLEX yylex (YYLEX_PARAM)
#else
# define YYLEX yylex ()
#endif

/* Enable debugging if requested.  */
#if YYDEBUG

# ifndef YYFPRINTF
#  include <stdio.h> /* INFRINGES ON USER NAME SPACE */
#  define YYFPRINTF fprintf
# endif

# define YYDPRINTF(Args)			\
do {						\
  if (yydebug)					\
    YYFPRINTF Args;				\
} while (YYID (0))

# define YY_SYMBOL_PRINT(Title, Type, Value, Location)			  \
do {									  \
  if (yydebug)								  \
    {									  \
      YYFPRINTF (stderr, "%s ", Title);					  \
      yy_symbol_print (stderr,						  \
		  Type, Value); \
      YYFPRINTF (stderr, "\n");						  \
    }									  \
} while (YYID (0))


/*--------------------------------.
| Print this symbol on YYOUTPUT.  |
`--------------------------------*/

/*ARGSUSED*/
#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
static void
yy_symbol_value_print (FILE *yyoutput, int yytype, YYSTYPE const * const yyvaluep)
#else
static void
yy_symbol_value_print (yyoutput, yytype, yyvaluep)
    FILE *yyoutput;
    int yytype;
    YYSTYPE const * const yyvaluep;
#endif
{
  if (!yyvaluep)
    return;
# ifdef YYPRINT
  if (yytype < YYNTOKENS)
    YYPRINT (yyoutput, yytoknum[yytype], *yyvaluep);
# else
  YYUSE (yyoutput);
# endif
  switch (yytype)
    {
      default:
	break;
    }
}


/*--------------------------------.
| Print this symbol on YYOUTPUT.  |
`--------------------------------*/

#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
static void
yy_symbol_print (FILE *yyoutput, int yytype, YYSTYPE const * const yyvaluep)
#else
static void
yy_symbol_print (yyoutput, yytype, yyvaluep)
    FILE *yyoutput;
    int yytype;
    YYSTYPE const * const yyvaluep;
#endif
{
  if (yytype < YYNTOKENS)
    YYFPRINTF (yyoutput, "token %s (", yytname[yytype]);
  else
    YYFPRINTF (yyoutput, "nterm %s (", yytname[yytype]);

  yy_symbol_value_print (yyoutput, yytype, yyvaluep);
  YYFPRINTF (yyoutput, ")");
}

/*------------------------------------------------------------------.
| yy_stack_print -- Print the state stack from its BOTTOM up to its |
| TOP (included).                                                   |
`------------------------------------------------------------------*/

#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
static void
yy_stack_print (yytype_int16 *yybottom, yytype_int16 *yytop)
#else
static void
yy_stack_print (yybottom, yytop)
    yytype_int16 *yybottom;
    yytype_int16 *yytop;
#endif
{
  YYFPRINTF (stderr, "Stack now");
  for (; yybottom <= yytop; yybottom++)
    {
      int yybot = *yybottom;
      YYFPRINTF (stderr, " %d", yybot);
    }
  YYFPRINTF (stderr, "\n");
}

# define YY_STACK_PRINT(Bottom, Top)				\
do {								\
  if (yydebug)							\
    yy_stack_print ((Bottom), (Top));				\
} while (YYID (0))


/*------------------------------------------------.
| Report that the YYRULE is going to be reduced.  |
`------------------------------------------------*/

#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
static void
yy_reduce_print (YYSTYPE *yyvsp, int yyrule)
#else
static void
yy_reduce_print (yyvsp, yyrule)
    YYSTYPE *yyvsp;
    int yyrule;
#endif
{
  int yynrhs = yyr2[yyrule];
  int yyi;
  unsigned long int yylno = yyrline[yyrule];
  YYFPRINTF (stderr, "Reducing stack by rule %d (line %lu):\n",
	     yyrule - 1, yylno);
  /* The symbols being reduced.  */
  for (yyi = 0; yyi < yynrhs; yyi++)
    {
      YYFPRINTF (stderr, "   $%d = ", yyi + 1);
      yy_symbol_print (stderr, yyrhs[yyprhs[yyrule] + yyi],
		       &(yyvsp[(yyi + 1) - (yynrhs)])
		       		       );
      YYFPRINTF (stderr, "\n");
    }
}

# define YY_REDUCE_PRINT(Rule)		\
do {					\
  if (yydebug)				\
    yy_reduce_print (yyvsp, Rule); \
} while (YYID (0))

/* Nonzero means print parse trace.  It is left uninitialized so that
   multiple parsers can coexist.  */
int yydebug;
#else /* !YYDEBUG */
# define YYDPRINTF(Args)
# define YY_SYMBOL_PRINT(Title, Type, Value, Location)
# define YY_STACK_PRINT(Bottom, Top)
# define YY_REDUCE_PRINT(Rule)
#endif /* !YYDEBUG */


/* YYINITDEPTH -- initial size of the parser's stacks.  */
#ifndef	YYINITDEPTH
# define YYINITDEPTH 200
#endif

/* YYMAXDEPTH -- maximum size the stacks can grow to (effective only
   if the built-in stack extension method is used).

   Do not make this value too large; the results are undefined if
   YYSTACK_ALLOC_MAXIMUM < YYSTACK_BYTES (YYMAXDEPTH)
   evaluated with infinite-precision integer arithmetic.  */

#ifndef YYMAXDEPTH
# define YYMAXDEPTH 10000
#endif



#if YYERROR_VERBOSE

# ifndef yystrlen
#  if defined __GLIBC__ && defined _STRING_H
#   define yystrlen strlen
#  else
/* Return the length of YYSTR.  */
#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
static YYSIZE_T
yystrlen (const char *yystr)
#else
static YYSIZE_T
yystrlen (yystr)
    const char *yystr;
#endif
{
  YYSIZE_T yylen;
  for (yylen = 0; yystr[yylen]; yylen++)
    continue;
  return yylen;
}
#  endif
# endif

# ifndef yystpcpy
#  if defined __GLIBC__ && defined _STRING_H && defined _GNU_SOURCE
#   define yystpcpy stpcpy
#  else
/* Copy YYSRC to YYDEST, returning the address of the terminating '\0' in
   YYDEST.  */
#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
static char *
yystpcpy (char *yydest, const char *yysrc)
#else
static char *
yystpcpy (yydest, yysrc)
    char *yydest;
    const char *yysrc;
#endif
{
  char *yyd = yydest;
  const char *yys = yysrc;

  while ((*yyd++ = *yys++) != '\0')
    continue;

  return yyd - 1;
}
#  endif
# endif

# ifndef yytnamerr
/* Copy to YYRES the contents of YYSTR after stripping away unnecessary
   quotes and backslashes, so that it's suitable for yyerror.  The
   heuristic is that double-quoting is unnecessary unless the string
   contains an apostrophe, a comma, or backslash (other than
   backslash-backslash).  YYSTR is taken from yytname.  If YYRES is
   null, do not copy; instead, return the length of what the result
   would have been.  */
static YYSIZE_T
yytnamerr (char *yyres, const char *yystr)
{
  if (*yystr == '"')
    {
      YYSIZE_T yyn = 0;
      char const *yyp = yystr;

      for (;;)
	switch (*++yyp)
	  {
	  case '\'':
	  case ',':
	    goto do_not_strip_quotes;

	  case '\\':
	    if (*++yyp != '\\')
	      goto do_not_strip_quotes;
	    /* Fall through.  */
	  default:
	    if (yyres)
	      yyres[yyn] = *yyp;
	    yyn++;
	    break;

	  case '"':
	    if (yyres)
	      yyres[yyn] = '\0';
	    return yyn;
	  }
    do_not_strip_quotes: ;
    }

  if (! yyres)
    return yystrlen (yystr);

  return yystpcpy (yyres, yystr) - yyres;
}
# endif

/* Copy into YYRESULT an error message about the unexpected token
   YYCHAR while in state YYSTATE.  Return the number of bytes copied,
   including the terminating null byte.  If YYRESULT is null, do not
   copy anything; just return the number of bytes that would be
   copied.  As a special case, return 0 if an ordinary "syntax error"
   message will do.  Return YYSIZE_MAXIMUM if overflow occurs during
   size calculation.  */
static YYSIZE_T
yysyntax_error (char *yyresult, int yystate, int yychar)
{
  int yyn = yypact[yystate];

  if (! (YYPACT_NINF < yyn && yyn <= YYLAST))
    return 0;
  else
    {
      int yytype = YYTRANSLATE (yychar);
      YYSIZE_T yysize0 = yytnamerr (0, yytname[yytype]);
      YYSIZE_T yysize = yysize0;
      YYSIZE_T yysize1;
      int yysize_overflow = 0;
      enum { YYERROR_VERBOSE_ARGS_MAXIMUM = 5 };
      char const *yyarg[YYERROR_VERBOSE_ARGS_MAXIMUM];
      int yyx;

# if 0
      /* This is so xgettext sees the translatable formats that are
	 constructed on the fly.  */
      YY_("syntax error, unexpected %s");
      YY_("syntax error, unexpected %s, expecting %s");
      YY_("syntax error, unexpected %s, expecting %s or %s");
      YY_("syntax error, unexpected %s, expecting %s or %s or %s");
      YY_("syntax error, unexpected %s, expecting %s or %s or %s or %s");
# endif
      char *yyfmt;
      char const *yyf;
      static char const yyunexpected[] = "syntax error, unexpected %s";
      static char const yyexpecting[] = ", expecting %s";
      static char const yyor[] = " or %s";
      char yyformat[sizeof yyunexpected
		    + sizeof yyexpecting - 1
		    + ((YYERROR_VERBOSE_ARGS_MAXIMUM - 2)
		       * (sizeof yyor - 1))];
      char const *yyprefix = yyexpecting;

      /* Start YYX at -YYN if negative to avoid negative indexes in
	 YYCHECK.  */
      int yyxbegin = yyn < 0 ? -yyn : 0;

      /* Stay within bounds of both yycheck and yytname.  */
      int yychecklim = YYLAST - yyn + 1;
      int yyxend = yychecklim < YYNTOKENS ? yychecklim : YYNTOKENS;
      int yycount = 1;

      yyarg[0] = yytname[yytype];
      yyfmt = yystpcpy (yyformat, yyunexpected);

      for (yyx = yyxbegin; yyx < yyxend; ++yyx)
	if (yycheck[yyx + yyn] == yyx && yyx != YYTERROR)
	  {
	    if (yycount == YYERROR_VERBOSE_ARGS_MAXIMUM)
	      {
		yycount = 1;
		yysize = yysize0;
		yyformat[sizeof yyunexpected - 1] = '\0';
		break;
	      }
	    yyarg[yycount++] = yytname[yyx];
	    yysize1 = yysize + yytnamerr (0, yytname[yyx]);
	    yysize_overflow |= (yysize1 < yysize);
	    yysize = yysize1;
	    yyfmt = yystpcpy (yyfmt, yyprefix);
	    yyprefix = yyor;
	  }

      yyf = YY_(yyformat);
      yysize1 = yysize + yystrlen (yyf);
      yysize_overflow |= (yysize1 < yysize);
      yysize = yysize1;

      if (yysize_overflow)
	return YYSIZE_MAXIMUM;

      if (yyresult)
	{
	  /* Avoid sprintf, as that infringes on the user's name space.
	     Don't have undefined behavior even if the translation
	     produced a string with the wrong number of "%s"s.  */
	  char *yyp = yyresult;
	  int yyi = 0;
	  while ((*yyp = *yyf) != '\0')
	    {
	      if (*yyp == '%' && yyf[1] == 's' && yyi < yycount)
		{
		  yyp += yytnamerr (yyp, yyarg[yyi++]);
		  yyf += 2;
		}
	      else
		{
		  yyp++;
		  yyf++;
		}
	    }
	}
      return yysize;
    }
}
#endif /* YYERROR_VERBOSE */


/*-----------------------------------------------.
| Release the memory associated to this symbol.  |
`-----------------------------------------------*/

/*ARGSUSED*/
#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
static void
yydestruct (const char *yymsg, int yytype, YYSTYPE *yyvaluep)
#else
static void
yydestruct (yymsg, yytype, yyvaluep)
    const char *yymsg;
    int yytype;
    YYSTYPE *yyvaluep;
#endif
{
  YYUSE (yyvaluep);

  if (!yymsg)
    yymsg = "Deleting";
  YY_SYMBOL_PRINT (yymsg, yytype, yyvaluep, yylocationp);

  switch (yytype)
    {

      default:
	break;
    }
}

/* Prevent warnings from -Wmissing-prototypes.  */
#ifdef YYPARSE_PARAM
#if defined __STDC__ || defined __cplusplus
int yyparse (void *YYPARSE_PARAM);
#else
int yyparse ();
#endif
#else /* ! YYPARSE_PARAM */
#if defined __STDC__ || defined __cplusplus
int yyparse (void);
#else
int yyparse ();
#endif
#endif /* ! YYPARSE_PARAM */


/* The lookahead symbol.  */
int yychar;

/* The semantic value of the lookahead symbol.  */
YYSTYPE yylval;

/* Number of syntax errors so far.  */
int yynerrs;



/*-------------------------.
| yyparse or yypush_parse.  |
`-------------------------*/

#ifdef YYPARSE_PARAM
#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
int
yyparse (void *YYPARSE_PARAM)
#else
int
yyparse (YYPARSE_PARAM)
    void *YYPARSE_PARAM;
#endif
#else /* ! YYPARSE_PARAM */
#if (defined __STDC__ || defined __C99__FUNC__ \
     || defined __cplusplus || defined _MSC_VER)
int
yyparse (void)
#else
int
yyparse ()

#endif
#endif
{


    int yystate;
    /* Number of tokens to shift before error messages enabled.  */
    int yyerrstatus;

    /* The stacks and their tools:
       `yyss': related to states.
       `yyvs': related to semantic values.

       Refer to the stacks thru separate pointers, to allow yyoverflow
       to reallocate them elsewhere.  */

    /* The state stack.  */
    yytype_int16 yyssa[YYINITDEPTH];
    yytype_int16 *yyss;
    yytype_int16 *yyssp;

    /* The semantic value stack.  */
    YYSTYPE yyvsa[YYINITDEPTH];
    YYSTYPE *yyvs;
    YYSTYPE *yyvsp;

    YYSIZE_T yystacksize;

  int yyn;
  int yyresult;
  /* Lookahead token as an internal (translated) token number.  */
  int yytoken;
  /* The variables used to return semantic value and location from the
     action routines.  */
  YYSTYPE yyval;

#if YYERROR_VERBOSE
  /* Buffer for error messages, and its allocated size.  */
  char yymsgbuf[128];
  char *yymsg = yymsgbuf;
  YYSIZE_T yymsg_alloc = sizeof yymsgbuf;
#endif

#define YYPOPSTACK(N)   (yyvsp -= (N), yyssp -= (N))

  /* The number of symbols on the RHS of the reduced rule.
     Keep to zero when no symbol should be popped.  */
  int yylen = 0;

  yytoken = 0;
  yyss = yyssa;
  yyvs = yyvsa;
  yystacksize = YYINITDEPTH;

  YYDPRINTF ((stderr, "Starting parse\n"));

  yystate = 0;
  yyerrstatus = 0;
  yynerrs = 0;
  yychar = YYEMPTY; /* Cause a token to be read.  */

  /* Initialize stack pointers.
     Waste one element of value and location stack
     so that they stay on the same level as the state stack.
     The wasted elements are never initialized.  */
  yyssp = yyss;
  yyvsp = yyvs;

  goto yysetstate;

/*------------------------------------------------------------.
| yynewstate -- Push a new state, which is found in yystate.  |
`------------------------------------------------------------*/
 yynewstate:
  /* In all cases, when you get here, the value and location stacks
     have just been pushed.  So pushing a state here evens the stacks.  */
  yyssp++;

 yysetstate:
  *yyssp = yystate;

  if (yyss + yystacksize - 1 <= yyssp)
    {
      /* Get the current used size of the three stacks, in elements.  */
      YYSIZE_T yysize = yyssp - yyss + 1;

#ifdef yyoverflow
      {
	/* Give user a chance to reallocate the stack.  Use copies of
	   these so that the &'s don't force the real ones into
	   memory.  */
	YYSTYPE *yyvs1 = yyvs;
	yytype_int16 *yyss1 = yyss;

	/* Each stack pointer address is followed by the size of the
	   data in use in that stack, in bytes.  This used to be a
	   conditional around just the two extra args, but that might
	   be undefined if yyoverflow is a macro.  */
	yyoverflow (YY_("memory exhausted"),
		    &yyss1, yysize * sizeof (*yyssp),
		    &yyvs1, yysize * sizeof (*yyvsp),
		    &yystacksize);

	yyss = yyss1;
	yyvs = yyvs1;
      }
#else /* no yyoverflow */
# ifndef YYSTACK_RELOCATE
      goto yyexhaustedlab;
# else
      /* Extend the stack our own way.  */
      if (YYMAXDEPTH <= yystacksize)
	goto yyexhaustedlab;
      yystacksize *= 2;
      if (YYMAXDEPTH < yystacksize)
	yystacksize = YYMAXDEPTH;

      {
	yytype_int16 *yyss1 = yyss;
	union yyalloc *yyptr =
	  (union yyalloc *) YYSTACK_ALLOC (YYSTACK_BYTES (yystacksize));
	if (! yyptr)
	  goto yyexhaustedlab;
	YYSTACK_RELOCATE (yyss_alloc, yyss);
	YYSTACK_RELOCATE (yyvs_alloc, yyvs);
#  undef YYSTACK_RELOCATE
	if (yyss1 != yyssa)
	  YYSTACK_FREE (yyss1);
      }
# endif
#endif /* no yyoverflow */

      yyssp = yyss + yysize - 1;
      yyvsp = yyvs + yysize - 1;

      YYDPRINTF ((stderr, "Stack size increased to %lu\n",
		  (unsigned long int) yystacksize));

      if (yyss + yystacksize - 1 <= yyssp)
	YYABORT;
    }

  YYDPRINTF ((stderr, "Entering state %d\n", yystate));

  if (yystate == YYFINAL)
    YYACCEPT;

  goto yybackup;

/*-----------.
| yybackup.  |
`-----------*/
yybackup:

  /* Do appropriate processing given the current state.  Read a
     lookahead token if we need one and don't already have one.  */

  /* First try to decide what to do without reference to lookahead token.  */
  yyn = yypact[yystate];
  if (yyn == YYPACT_NINF)
    goto yydefault;

  /* Not known => get a lookahead token if don't already have one.  */

  /* YYCHAR is either YYEMPTY or YYEOF or a valid lookahead symbol.  */
  if (yychar == YYEMPTY)
    {
      YYDPRINTF ((stderr, "Reading a token: "));
      yychar = YYLEX;
    }

  if (yychar <= YYEOF)
    {
      yychar = yytoken = YYEOF;
      YYDPRINTF ((stderr, "Now at end of input.\n"));
    }
  else
    {
      yytoken = YYTRANSLATE (yychar);
      YY_SYMBOL_PRINT ("Next token is", yytoken, &yylval, &yylloc);
    }

  /* If the proper action on seeing token YYTOKEN is to reduce or to
     detect an error, take that action.  */
  yyn += yytoken;
  if (yyn < 0 || YYLAST < yyn || yycheck[yyn] != yytoken)
    goto yydefault;
  yyn = yytable[yyn];
  if (yyn <= 0)
    {
      if (yyn == 0 || yyn == YYTABLE_NINF)
	goto yyerrlab;
      yyn = -yyn;
      goto yyreduce;
    }

  /* Count tokens shifted since error; after three, turn off error
     status.  */
  if (yyerrstatus)
    yyerrstatus--;

  /* Shift the lookahead token.  */
  YY_SYMBOL_PRINT ("Shifting", yytoken, &yylval, &yylloc);

  /* Discard the shifted token.  */
  yychar = YYEMPTY;

  yystate = yyn;
  *++yyvsp = yylval;

  goto yynewstate;


/*-----------------------------------------------------------.
| yydefault -- do the default action for the current state.  |
`-----------------------------------------------------------*/
yydefault:
  yyn = yydefact[yystate];
  if (yyn == 0)
    goto yyerrlab;
  goto yyreduce;


/*-----------------------------.
| yyreduce -- Do a reduction.  |
`-----------------------------*/
yyreduce:
  /* yyn is the number of a rule to reduce with.  */
  yylen = yyr2[yyn];

  /* If YYLEN is nonzero, implement the default value of the action:
     `$$ = $1'.

     Otherwise, the following line sets YYVAL to garbage.
     This behavior is undocumented and Bison
     users should not rely upon it.  Assigning to YYVAL
     unconditionally makes the parser a bit smaller, and it avoids a
     GCC warning that YYVAL may be used uninitialized.  */
  yyval = yyvsp[1-yylen];


  YY_REDUCE_PRINT (yyn);
  switch (yyn)
    {
        case 2:

/* Line 1455 of yacc.c  */
#line 114 "parser_sel.yxx"
    {
		  SelCompiler::getInstance()->evalNode((yyvsp[(1) - (1)].seltok));
		}
    break;

  case 3:

/* Line 1455 of yacc.c  */
#line 124 "parser_sel.yxx"
    {
		  //MB_DPRINT("sel_and\n");
		  (yyval.seltok) = new SelBinNode((yyvsp[(1) - (3)].seltok),(yyvsp[(3) - (3)].seltok),SelBinNode::OP_AND);
		}
    break;

  case 4:

/* Line 1455 of yacc.c  */
#line 129 "parser_sel.yxx"
    {
		  //MB_DPRINT("sel_or\n");
		  (yyval.seltok) = new SelBinNode((yyvsp[(1) - (3)].seltok),(yyvsp[(3) - (3)].seltok),SelBinNode::OP_OR);
		}
    break;

  case 5:

/* Line 1455 of yacc.c  */
#line 134 "parser_sel.yxx"
    {
		  //MB_DPRINT("sel_not\n");
		  (yyval.seltok) = new SelOpNode((yyvsp[(2) - (2)].seltok),SelOpNode::OP_NOT);
		}
    break;

  case 6:

/* Line 1455 of yacc.c  */
#line 139 "parser_sel.yxx"
    {
		  SelCompiler::setSelState();
		  MB_DPRINTLN("AROUND set normal state");
		  SelOpNode *pp = new SelOpNode((yyvsp[(1) - (3)].seltok),SelOpNode::OP_AROUND);
		  pp->setValue((yyvsp[(3) - (3)].floatnum));
		  (yyval.seltok) = pp;
		}
    break;

  case 7:

/* Line 1455 of yacc.c  */
#line 147 "parser_sel.yxx"
    {
		  SelCompiler::setSelState();
		  SelOpNode *pp = new SelOpNode((yyvsp[(1) - (6)].seltok),SelOpNode::OP_AROUND);
		  pp->setAroundTarget((yyvsp[(4) - (6)].str));
		  pp->setValue((yyvsp[(6) - (6)].floatnum));
		  (yyval.seltok) = pp;
		  delete [] (yyvsp[(4) - (6)].str);
		}
    break;

  case 8:

/* Line 1455 of yacc.c  */
#line 156 "parser_sel.yxx"
    {
		  SelCompiler::setSelState();
		  SelOpNode *pp = new SelOpNode((yyvsp[(1) - (3)].seltok),SelOpNode::OP_EXPAND);
		  pp->setValue((yyvsp[(3) - (3)].floatnum));
		  (yyval.seltok) = pp;
		}
    break;

  case 9:

/* Line 1455 of yacc.c  */
#line 163 "parser_sel.yxx"
    {
		  SelCompiler::setSelState();
		  SelOpNode *pp = new SelOpNode((yyvsp[(1) - (3)].seltok),SelOpNode::OP_NEIGHBOR);
		  pp->setValue((yyvsp[(3) - (3)].floatnum));
		  (yyval.seltok) = pp;
		}
    break;

  case 10:

/* Line 1455 of yacc.c  */
#line 170 "parser_sel.yxx"
    {
		  SelCompiler::setSelState();
		  SelOpNode *pp = new SelOpNode((yyvsp[(1) - (3)].seltok),SelOpNode::OP_EXTEND);
		  pp->setValue((yyvsp[(3) - (3)].floatnum));
		  (yyval.seltok) = pp;
		}
    break;

  case 11:

/* Line 1455 of yacc.c  */
#line 177 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelOpNode((yyvsp[(2) - (2)].seltok),SelOpNode::OP_BYRES);
		}
    break;

  case 12:

/* Line 1455 of yacc.c  */
#line 181 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelOpNode((yyvsp[(2) - (2)].seltok),SelOpNode::OP_BYMAINCH);
		}
    break;

  case 13:

/* Line 1455 of yacc.c  */
#line 185 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelOpNode((yyvsp[(2) - (2)].seltok),SelOpNode::OP_BYSIDECH);
		}
    break;

  case 14:

/* Line 1455 of yacc.c  */
#line 188 "parser_sel.yxx"
    { (yyval.seltok) = (yyvsp[(2) - (3)].seltok); }
    break;

  case 16:

/* Line 1455 of yacc.c  */
#line 193 "parser_sel.yxx"
    {
		  if (!SelCompiler::checkNameRef((yyvsp[(1) - (1)].str)))
		    YYERROR;
		  SelRefNode *pp = new SelRefNode((yyvsp[(1) - (1)].str));
		  //pp->setName($1);
		  (yyval.seltok) = pp;

		  delete [] (yyvsp[(1) - (1)].str);
		}
    break;

  case 17:

/* Line 1455 of yacc.c  */
#line 203 "parser_sel.yxx"
    { (yyval.seltok) = new SelAllNode(true); }
    break;

  case 18:

/* Line 1455 of yacc.c  */
#line 205 "parser_sel.yxx"
    { (yyval.seltok) = new SelAllNode(false); }
    break;

  case 19:

/* Line 1455 of yacc.c  */
#line 208 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelTermNode((SelNamesNode *)(yyvsp[(2) - (2)].seltok),
		                       SelTermNode::ELEMENT);
		}
    break;

  case 20:

/* Line 1455 of yacc.c  */
#line 214 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelTermNode((SelNamesNode *)(yyvsp[(2) - (2)].seltok),
		                       SelTermNode::ATOMNAME);
		}
    break;

  case 21:

/* Line 1455 of yacc.c  */
#line 220 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelTermNode((SelNamesNode *)(yyvsp[(2) - (2)].seltok),
		                       SelTermNode::ALTCONF_NAME);
		}
    break;

  case 22:

/* Line 1455 of yacc.c  */
#line 226 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelTermNode((SelNamesNode *)(yyvsp[(2) - (2)].seltok),
		                       SelTermNode::RESIDNAME);
		}
    break;

  case 23:

/* Line 1455 of yacc.c  */
#line 232 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelTermNode((SelResidNode *)(yyvsp[(2) - (2)].seltok),
		                       SelTermNode::RESIDRANGE);
		}
    break;

  case 24:

/* Line 1455 of yacc.c  */
#line 237 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelTermNode((SelNamesNode *)(yyvsp[(2) - (2)].seltok),
		                       SelTermNode::CHAINNAME);
		}
    break;

  case 25:

/* Line 1455 of yacc.c  */
#line 242 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelTermNode((SelRangesNode *)(yyvsp[(2) - (2)].seltok),
		                       SelTermNode::AIDRANGE);
		}
    break;

  case 26:

/* Line 1455 of yacc.c  */
#line 246 "parser_sel.yxx"
    { SelCompiler::setSelNumState();}
    break;

  case 27:

/* Line 1455 of yacc.c  */
#line 247 "parser_sel.yxx"
    {
		  SelCompiler::setSelState();
		  (yyval.seltok) = new SelCompNode(SelCompNode::COMP_BFAC, (yyvsp[(2) - (4)].intnum), (yyvsp[(4) - (4)].floatnum));
		}
    break;

  case 28:

/* Line 1455 of yacc.c  */
#line 251 "parser_sel.yxx"
    { SelCompiler::setSelNumState();}
    break;

  case 29:

/* Line 1455 of yacc.c  */
#line 252 "parser_sel.yxx"
    {
		  SelCompiler::setSelState();
		  (yyval.seltok) = new SelCompNode(SelCompNode::COMP_OCC, (yyvsp[(2) - (4)].intnum), (yyvsp[(4) - (4)].floatnum));
		}
    break;

  case 30:

/* Line 1455 of yacc.c  */
#line 257 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelPropNode(SelPropNode::RPROP, (yyvsp[(2) - (4)].str), (yyvsp[(4) - (4)].str));
		  delete [] (yyvsp[(2) - (4)].str); delete [] (yyvsp[(4) - (4)].str);
		}
    break;

  case 33:

/* Line 1455 of yacc.c  */
#line 266 "parser_sel.yxx"
    {
		  LString buf = (yyvsp[(1) - (2)].str);
		  delete [] (yyvsp[(1) - (2)].str);
		  buf += ":";
		  (yyval.str) = LChar::dup(buf);
		}
    break;

  case 34:

/* Line 1455 of yacc.c  */
#line 273 "parser_sel.yxx"
    {
		  LString buf = (yyvsp[(1) - (3)].str);
		  delete [] (yyvsp[(1) - (3)].str);
		  buf += ":";
		  buf += (yyvsp[(3) - (3)].str);
		  delete [] (yyvsp[(3) - (3)].str);
		  (yyval.str) = LChar::dup(buf);
		}
    break;

  case 35:

/* Line 1455 of yacc.c  */
#line 282 "parser_sel.yxx"
    {
		  // empty name for chain or altconf
		  (yyval.str) = LChar::dup("");
		}
    break;

  case 36:

/* Line 1455 of yacc.c  */
#line 287 "parser_sel.yxx"
    {
		  // name-node composed of int num should be permitted...
		  LString sbuf = LString::format("%d", (yyvsp[(1) - (1)].intnum));
		  (yyval.str) = LChar::dup(sbuf);
		}
    break;

  case 37:

/* Line 1455 of yacc.c  */
#line 295 "parser_sel.yxx"
    {
		  SelNamesNode *pp = new SelNamesNode();
		  pp->append((yyvsp[(1) - (1)].str)); delete [] (yyvsp[(1) - (1)].str);
		  (yyval.seltok) = pp;
		}
    break;

  case 38:

/* Line 1455 of yacc.c  */
#line 301 "parser_sel.yxx"
    {
		  SelNamesNode *pp  = (SelNamesNode *) (yyvsp[(1) - (3)].seltok);
		  pp->append((yyvsp[(3) - (3)].str)); delete [] (yyvsp[(3) - (3)].str);
		  (yyval.seltok) = pp;
		}
    break;

  case 39:

/* Line 1455 of yacc.c  */
#line 307 "parser_sel.yxx"
    {
		  SelNamesNode *pp = new SelNamesNode();
		  pp->setRegEx((yyvsp[(1) - (1)].str));
		  delete [] (yyvsp[(1) - (1)].str);
		  (yyval.seltok) = pp;
		}
    break;

  case 40:

/* Line 1455 of yacc.c  */
#line 317 "parser_sel.yxx"
    {
		  (yyval.seltok) = new SelHierNode(static_cast<SelNamesNode *>((yyvsp[(1) - (5)].seltok)),
		                       static_cast<SelResidNode *>((yyvsp[(3) - (5)].seltok)),
		                       static_cast<SelNamesNode *>((yyvsp[(5) - (5)].seltok)));
		  //$$ = new SelBinNode(new SelBinNode($1, $3, SelBinNode::OP_AND),
		  //   $5, SelBinNode::OP_AND);
		}
    break;

  case 41:

/* Line 1455 of yacc.c  */
#line 326 "parser_sel.yxx"
    { (yyval.seltok) = NULL; }
    break;

  case 42:

/* Line 1455 of yacc.c  */
#line 327 "parser_sel.yxx"
    { (yyval.seltok) = (yyvsp[(1) - (1)].seltok); }
    break;

  case 43:

/* Line 1455 of yacc.c  */
#line 330 "parser_sel.yxx"
    { (yyval.seltok) = NULL; }
    break;

  case 44:

/* Line 1455 of yacc.c  */
#line 331 "parser_sel.yxx"
    { (yyval.seltok) = (yyvsp[(1) - (1)].seltok); }
    break;

  case 45:

/* Line 1455 of yacc.c  */
#line 334 "parser_sel.yxx"
    { (yyval.seltok) = NULL; }
    break;

  case 46:

/* Line 1455 of yacc.c  */
#line 335 "parser_sel.yxx"
    { (yyval.seltok) = (yyvsp[(1) - (1)].seltok); }
    break;

  case 47:

/* Line 1455 of yacc.c  */
#line 340 "parser_sel.yxx"
    {(yyval.intnum) = SelCompNode::COMP_EQ;}
    break;

  case 48:

/* Line 1455 of yacc.c  */
#line 341 "parser_sel.yxx"
    {(yyval.intnum) = SelCompNode::COMP_LT;}
    break;

  case 49:

/* Line 1455 of yacc.c  */
#line 342 "parser_sel.yxx"
    {(yyval.intnum) = SelCompNode::COMP_GT;}
    break;

  case 50:

/* Line 1455 of yacc.c  */
#line 346 "parser_sel.yxx"
    {
		  (yyval.floatnum)=(yyvsp[(1) - (1)].intnum);
		}
    break;

  case 51:

/* Line 1455 of yacc.c  */
#line 350 "parser_sel.yxx"
    {
		  (yyval.floatnum)=(yyvsp[(1) - (1)].floatnum);
		}
    break;

  case 52:

/* Line 1455 of yacc.c  */
#line 356 "parser_sel.yxx"
    {
		  SelRangesNode *p1 = new SelRangesNode((yyvsp[(1) - (1)].intrng).start, (yyvsp[(1) - (1)].intrng).end);
		  (yyval.seltok) = p1;
		}
    break;

  case 53:

/* Line 1455 of yacc.c  */
#line 361 "parser_sel.yxx"
    {
		  SelRangesNode *p1 = (SelRangesNode *) (yyvsp[(1) - (3)].seltok);
		  p1->append((yyvsp[(3) - (3)].intrng).start, (yyvsp[(3) - (3)].intrng).end);
		  (yyval.seltok) = p1;
		}
    break;

  case 54:

/* Line 1455 of yacc.c  */
#line 370 "parser_sel.yxx"
    {
		  SelResidNode *p1 = new SelResidNode((yyvsp[(1) - (1)].intrng).start, (yyvsp[(1) - (1)].intrng).cstart, (yyvsp[(1) - (1)].intrng).end, (yyvsp[(1) - (1)].intrng).cend);
		  (yyval.seltok) = p1;
		}
    break;

  case 55:

/* Line 1455 of yacc.c  */
#line 375 "parser_sel.yxx"
    {
		  SelResidNode *p1 = (SelResidNode *) (yyvsp[(1) - (3)].seltok);
		  p1->append((yyvsp[(3) - (3)].intrng).start, (yyvsp[(3) - (3)].intrng).cstart, (yyvsp[(3) - (3)].intrng).end, (yyvsp[(3) - (3)].intrng).cend);
		  (yyval.seltok) = p1;
		}
    break;

  case 56:

/* Line 1455 of yacc.c  */
#line 383 "parser_sel.yxx"
    {
		  (yyval.intrng).start = (yyval.intrng).end = (yyvsp[(1) - (1)].intnum);
		  (yyval.intrng).cstart = (yyval.intrng).cend = 0;
		}
    break;

  case 57:

/* Line 1455 of yacc.c  */
#line 388 "parser_sel.yxx"
    {
		  (yyval.intrng).start = (yyval.intrng).end = (yyvsp[(1) - (1)].insres).intnum;
		  (yyval.intrng).cstart = (yyval.intrng).cend = (yyvsp[(1) - (1)].insres).inscode;
		}
    break;

  case 58:

/* Line 1455 of yacc.c  */
#line 393 "parser_sel.yxx"
    {
		  (yyval.intrng).start = (yyvsp[(1) - (3)].intnum);
		  (yyval.intrng).end = (yyvsp[(3) - (3)].intnum);
		  (yyval.intrng).cstart = (yyval.intrng).cend = 0;
		}
    break;

  case 59:

/* Line 1455 of yacc.c  */
#line 399 "parser_sel.yxx"
    {
		  (yyval.intrng).start = (yyvsp[(1) - (3)].insres).intnum;
		  (yyval.intrng).cstart = (yyvsp[(1) - (3)].insres).inscode;
		  (yyval.intrng).end = (yyvsp[(3) - (3)].intnum);
		  (yyval.intrng).cend = 0;
		}
    break;

  case 60:

/* Line 1455 of yacc.c  */
#line 406 "parser_sel.yxx"
    {
		  (yyval.intrng).start = (yyvsp[(1) - (3)].intnum);
		  (yyval.intrng).cstart = 0;
		  (yyval.intrng).end = (yyvsp[(3) - (3)].insres).intnum;
		  (yyval.intrng).cend = (yyvsp[(3) - (3)].insres).inscode;
		}
    break;

  case 61:

/* Line 1455 of yacc.c  */
#line 413 "parser_sel.yxx"
    {
		  (yyval.intrng).start = (yyvsp[(1) - (3)].insres).intnum;
		  (yyval.intrng).cstart = (yyvsp[(1) - (3)].insres).inscode;
		  (yyval.intrng).end = (yyvsp[(3) - (3)].insres).intnum;
		  (yyval.intrng).cend = (yyvsp[(3) - (3)].insres).inscode;
		}
    break;



/* Line 1455 of yacc.c  */
#line 2094 "../../../src/modules/molstr/parser_sel.cxx"
      default: break;
    }
  YY_SYMBOL_PRINT ("-> $$ =", yyr1[yyn], &yyval, &yyloc);

  YYPOPSTACK (yylen);
  yylen = 0;
  YY_STACK_PRINT (yyss, yyssp);

  *++yyvsp = yyval;

  /* Now `shift' the result of the reduction.  Determine what state
     that goes to, based on the state we popped back to and the rule
     number reduced by.  */

  yyn = yyr1[yyn];

  yystate = yypgoto[yyn - YYNTOKENS] + *yyssp;
  if (0 <= yystate && yystate <= YYLAST && yycheck[yystate] == *yyssp)
    yystate = yytable[yystate];
  else
    yystate = yydefgoto[yyn - YYNTOKENS];

  goto yynewstate;


/*------------------------------------.
| yyerrlab -- here on detecting error |
`------------------------------------*/
yyerrlab:
  /* If not already recovering from an error, report this error.  */
  if (!yyerrstatus)
    {
      ++yynerrs;
#if ! YYERROR_VERBOSE
      yyerror (YY_("syntax error"));
#else
      {
	YYSIZE_T yysize = yysyntax_error (0, yystate, yychar);
	if (yymsg_alloc < yysize && yymsg_alloc < YYSTACK_ALLOC_MAXIMUM)
	  {
	    YYSIZE_T yyalloc = 2 * yysize;
	    if (! (yysize <= yyalloc && yyalloc <= YYSTACK_ALLOC_MAXIMUM))
	      yyalloc = YYSTACK_ALLOC_MAXIMUM;
	    if (yymsg != yymsgbuf)
	      YYSTACK_FREE (yymsg);
	    yymsg = (char *) YYSTACK_ALLOC (yyalloc);
	    if (yymsg)
	      yymsg_alloc = yyalloc;
	    else
	      {
		yymsg = yymsgbuf;
		yymsg_alloc = sizeof yymsgbuf;
	      }
	  }

	if (0 < yysize && yysize <= yymsg_alloc)
	  {
	    (void) yysyntax_error (yymsg, yystate, yychar);
	    yyerror (yymsg);
	  }
	else
	  {
	    yyerror (YY_("syntax error"));
	    if (yysize != 0)
	      goto yyexhaustedlab;
	  }
      }
#endif
    }



  if (yyerrstatus == 3)
    {
      /* If just tried and failed to reuse lookahead token after an
	 error, discard it.  */

      if (yychar <= YYEOF)
	{
	  /* Return failure if at end of input.  */
	  if (yychar == YYEOF)
	    YYABORT;
	}
      else
	{
	  yydestruct ("Error: discarding",
		      yytoken, &yylval);
	  yychar = YYEMPTY;
	}
    }

  /* Else will try to reuse lookahead token after shifting the error
     token.  */
  goto yyerrlab1;


/*---------------------------------------------------.
| yyerrorlab -- error raised explicitly by YYERROR.  |
`---------------------------------------------------*/
yyerrorlab:

  /* Pacify compilers like GCC when the user code never invokes
     YYERROR and the label yyerrorlab therefore never appears in user
     code.  */
  if (/*CONSTCOND*/ 0)
     goto yyerrorlab;

  /* Do not reclaim the symbols of the rule which action triggered
     this YYERROR.  */
  YYPOPSTACK (yylen);
  yylen = 0;
  YY_STACK_PRINT (yyss, yyssp);
  yystate = *yyssp;
  goto yyerrlab1;


/*-------------------------------------------------------------.
| yyerrlab1 -- common code for both syntax error and YYERROR.  |
`-------------------------------------------------------------*/
yyerrlab1:
  yyerrstatus = 3;	/* Each real token shifted decrements this.  */

  for (;;)
    {
      yyn = yypact[yystate];
      if (yyn != YYPACT_NINF)
	{
	  yyn += YYTERROR;
	  if (0 <= yyn && yyn <= YYLAST && yycheck[yyn] == YYTERROR)
	    {
	      yyn = yytable[yyn];
	      if (0 < yyn)
		break;
	    }
	}

      /* Pop the current state because it cannot handle the error token.  */
      if (yyssp == yyss)
	YYABORT;


      yydestruct ("Error: popping",
		  yystos[yystate], yyvsp);
      YYPOPSTACK (1);
      yystate = *yyssp;
      YY_STACK_PRINT (yyss, yyssp);
    }

  *++yyvsp = yylval;


  /* Shift the error token.  */
  YY_SYMBOL_PRINT ("Shifting", yystos[yyn], yyvsp, yylsp);

  yystate = yyn;
  goto yynewstate;


/*-------------------------------------.
| yyacceptlab -- YYACCEPT comes here.  |
`-------------------------------------*/
yyacceptlab:
  yyresult = 0;
  goto yyreturn;

/*-----------------------------------.
| yyabortlab -- YYABORT comes here.  |
`-----------------------------------*/
yyabortlab:
  yyresult = 1;
  goto yyreturn;

#if !defined(yyoverflow) || YYERROR_VERBOSE
/*-------------------------------------------------.
| yyexhaustedlab -- memory exhaustion comes here.  |
`-------------------------------------------------*/
yyexhaustedlab:
  yyerror (YY_("memory exhausted"));
  yyresult = 2;
  /* Fall through.  */
#endif

yyreturn:
  if (yychar != YYEMPTY)
     yydestruct ("Cleanup: discarding lookahead",
		 yytoken, &yylval);
  /* Do not reclaim the symbols of the rule which action triggered
     this YYABORT or YYACCEPT.  */
  YYPOPSTACK (yylen);
  YY_STACK_PRINT (yyss, yyssp);
  while (yyssp != yyss)
    {
      yydestruct ("Cleanup: popping",
		  yystos[*yyssp], yyvsp);
      YYPOPSTACK (1);
    }
#ifndef yyoverflow
  if (yyss != yyssa)
    YYSTACK_FREE (yyss);
#endif
#if YYERROR_VERBOSE
  if (yymsg != yymsgbuf)
    YYSTACK_FREE (yymsg);
#endif
  /* Make sure YYID is used.  */
  return YYID (yyresult);
}



/* Line 1675 of yacc.c  */
#line 420 "parser_sel.yxx"


extern char *yytext;

int yyerror(char* error)
{
  LOG_DPRINTLN("ERROR: %s at \"%s\"", error, yytext);
  return 0;
}

//private static
void SelCompiler::resetParserState()
{
  yyclearin;
}

