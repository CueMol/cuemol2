//
//
//

const {Cc,Ci,Cr} = require("chrome");
const debug_util = require("debug_util");

const NS_XHTML   = "http://www.w3.org/1999/xhtml";

const HTML_BR    = "html:br";
const HTML_IMG   = "html:img";
const HTML_SPAN  = "html:span";
const HTML_TABLE = "html:table";
const HTML_TBODY = "html:tbody";
const HTML_TD    = "html:td";
const HTML_TH    = "html:th";
const HTML_TR    = "html:tr";

var HTML = exports.HTML = function HTML (doc, tagName, attribs, args)
{
    var elem = doc.createElementNS (NS_XHTML, tagName);

    if (typeof attribs == "string")
        elem.setAttribute ("class", attribs);
    else if (attribs && typeof attribs == "object")
        for (var p in attribs)
            elem.setAttribute (p, attribs[p]);

    var start = 0;

    if (args)
    {
        if (!(args instanceof Array))
            args = [args];
        else if (arguments.length > 3)
        {
            start = 2; args = arguments;
        }

        for (var i = start; i < args.length; ++i)
            if (typeof args[i] == "string")
                elem.appendChild (doc.createTextNode(args[i]));
            else if (args[i])
                elem.appendChild (args[i]);

    }

    return elem;
}

exports.text = function htmlText(doc, text)
{
    return doc.createTextNode(text);
}

exports.italic = function htmlI(doc, contents, attribs)
{
  return HTML(doc, "html:i", attribs, contents);
}

exports.sup = function htmlSup(doc, contents, attribs)
{
  return HTML(doc, "html:sup", attribs, contents);
}

exports.sub = function htmlSub(doc, contents, attribs)
{
  return HTML(doc, "html:sub", attribs, contents);
}

exports.bold = function htmlB(doc, contents, attribs)
{
  return HTML(doc, "html:b", attribs, contents);
}

exports.replace = function (elem, ch)
{
  while (elem.firstChild)
    elem.removeChild(elem.firstChild);

  if ('forEach' in ch && typeof ch.forEach == 'function') {
    ch.forEach( function (e) {
      elem.appendChild(e);
    } );
  }
  else
    elem.appendChild(ch);
}

//////////////////////

exports.htmlA = function htmlA(attribs, href, contents)
{
    if (typeof contents == "undefined")
        contents = href;

    var a = HTML("html:a", attribs, contents);
    a.setAttribute ("href", href);

    return a;
}

exports.htmlBR = function htmlBR(attribs)
{
    return HTML("html:br", attribs, argumentsAsArray(arguments, 1));
}

exports.htmlWBR = function htmlWBR(attribs)
{
    return HTML("html:wbr", attribs, argumentsAsArray(arguments, 1));
}

exports.htmlImg = function htmlImg(attribs, src)
{
    var img = HTML("html:img", attribs, argumentsAsArray(arguments, 2));
    if (src)
        img.setAttribute ("src", src);
    return img;
}

exports.htmlSpan = function htmlSpan(attribs)
{
    return HTML("html:span", attribs, argumentsAsArray(arguments, 1));
}

exports.htmlTable = function htmlTable(attribs)
{
    return HTML("html:table", attribs, argumentsAsArray(arguments, 1));
}

exports.htmlTBody = function htmlTBody(attribs)
{
    return HTML("html:tbody", attribs, argumentsAsArray(arguments, 1));
}

exports.htmlTD = function htmlTD(attribs)
{
    return HTML("html:td", attribs, argumentsAsArray(arguments, 1));
}

exports.htmlTR = function htmlTR(attribs)
{
    return HTML("html:tr", attribs, argumentsAsArray(arguments, 1));
}

exports.htmlTH = function htmlTH(attribs)
{
    return HTML("html:th", attribs, argumentsAsArray(arguments, 1));
}

