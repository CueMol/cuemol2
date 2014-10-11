#pragma once

///
/// IQm2ViewCtl interface definition
///  This if corresponds to qINativeWidget in the XPCOM implementation
[
  object,
  uuid(44878902-c43c-4e4a-a3de-ebeb11f8b02b),
  dual,
  helpstring("IQm2ViewCtl Interface"),
  pointer_default(unique)
  ]
__interface IQm2ViewCtl : public IDispatch
{
  
  /// Source path for the scene to which this view is attached (getter)
  [propget, id(1), helpstring("Property source")] HRESULT Source([out, retval] BSTR* pVal);

  /// Source path for the scene to which this view is attached (setter)
  [propput, id(1), helpstring("Property source")] HRESULT Source([in] BSTR newVal);

/*
  /// Default font for this view
  [propputref, id(DISPID_FONT)] HRESULT Font([in]IFontDisp* pFont);
  [propput, id(DISPID_FONT)] HRESULT Font([in]IFontDisp* pFont);
  [propget, id(DISPID_FONT)] HRESULT Font([out, retval]IFontDisp** ppFont);
*/
};
