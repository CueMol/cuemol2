/*****************************************************************************
 * CueMol2 Plugin description for OS X
 *****************************************************************************/

/* Definitions of system resource types */

data 'carb' (0)
{
};

/* The first string in the array is a plugin description,
 * the second is the plugin name */
resource 'STR#' (126)
{
    {
        "Version 2.0.0, copyright 2003-2010 BKR-LAB"
        "<BR><A HREF='http://www.cuemol.org'>http://www.cuemol.org/</A>",
        "CueMol2 Plug-in"
    };
};

/* A description for each MIME type in resource 128 */
resource 'STR#' (127)
{
    {
        /* MPEG-1 and MPEG-2 */
        "CueMol2 Plugin",
    };
};

/* A series of pairs of strings... first MIME type, then file extension(s) */
resource 'STR#' (128,"MIME Type")
{
    {
        "application/cuemol2-plugin", "xxx",
    };
};

resource 'STR ' (129)
{
   "CueMol2 Plugin: Load ERROR!!"
};
