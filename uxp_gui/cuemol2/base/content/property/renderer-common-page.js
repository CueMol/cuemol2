// -*-Mode: C++;-*-
//
// renderer-common-page.js
//   Renderer Common Page
//

///////////////////////////////////////
// Embedded "groupbox" version

if (!("RendCommPropEdit" in cuemolui)) {

  cuemolui.RendCommPropEdit = ( function () {

    var ctor = function (aMain)
    {
      this.mGenEdit = aMain;
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      dd("PropEditCommon onLoad called");

      var that = this;

      this.mRendName = document.getElementById("comprop-name");

      this.mSelList = document.getElementById("comprop-molsel");
      this.mSelList.sceneID = this.mGenEdit.getSceneID();
      this.mSelList.buildBox();
      window.setTimeout( function () {
        that.mSelList.addEventListener("select",
                                       function (event) {that.validateWidgets(event)},
                                       false);
      }, 0);

      this.mMateName = document.getElementById("comprop-material");
      this.populateMatList();

      this.mAlpha = document.getElementById("comprop-alpha");

      // Add event listeners
      this.mRendName.addEventListener("change",
                                      function (event) { that.validateWidgets(event) },
                                      false);
      this.mSelList.addEventListener("change",
                                     function (event) { that.validateWidgets(event) },
                                     false);

      var elem = document.getElementById("comprop-visible");
      elem.addEventListener("command",
                            function (event) { that.validateWidgets(event) },
                            false);

      elem = document.getElementById("comprop-locked");
      elem.addEventListener("command",
                            function (event) { that.validateWidgets(event) },
                            false);

      this.mMateName.addEventListener("select",
                                      function (event) { that.validateWidgets(event) },
                                      false);
      this.mAlpha.addEventListener("change",
                                   function (event) { that.validateWidgets(event) },
                                   false);

      //////////////////
      // Edge lines

      this.mEdgeType = document.getElementById("comprop-edgetype");
      this.mEdgeType.addEventListener("command",
                                      function (event) { that.validateWidgets(event) },
                                      false);

      this.mEgLinew = document.getElementById("comprop-eglinew");
      this.mEgLinew.addEventListener("change",
                                     function (event) { that.validateWidgets(event) },
                                     false);

      this.mEgLineCol = document.getElementById("comprop-egline-color");
      this.mEgLineCol.setTargetSceneID(gMain.mTgtSceID);
      this.mEgLineCol.addEventListener("change",
                                       function (event) { that.validateWidgets(event) },
                                       false);
      dd("PropEditCommon onLoad OK.");
    };

    klass.populateMatList = function ()
    {
      var stylem = cuemol.getService("StyleManager");
      
      var menu = this.mMateName.menupopup;
      util.appendMenu(document, menu, "", "(none)");

      var json, defs = {};
      if (gMain.mTgtSceID!=0) {
        json = stylem.getMaterialNamesJSON(gMain.mTgtSceID);
        dd("scene material defs: "+json);
        let ls = JSON.parse(json);
        //this.appendMatList(defs);
        ls.forEach(function (aElem) {
          defs[aElem] = aElem;
        });
      }

      json = stylem.getMaterialNamesJSON(0);
      dd("global material defs: "+json);
      let ls = JSON.parse(json);
      //this.appendMatList(defs);
      ls.forEach(function (aElem) {
        defs[aElem] = aElem;
      });

      var aElem;
      for (aElem in defs) {
        util.appendMenu(document, menu, aElem, aElem);
      }

      /*var that = this;
      setTimeout( function () {
        that.updateNamedColorSel();
      }, 0);*/
    };

    /// Intrn-data --> widget
    klass.updateWidgets = function ()
    {
      var elem;

      elem = this.mGenEdit.findPropData("name");
      this.mRendName.value = elem.value;

      var elem = this.mGenEdit.findPropData("sel");
      if (elem) {
        var selstr = elem.value;
        this.mSelList.origSel = selstr;
        this.mSelList.buildBox();
      }
      else {
        this.mSelList.disabled = true;
      }

      elem = this.mGenEdit.findPropData("visible");
      document.getElementById("comprop-visible").checked = elem.value;

      elem = this.mGenEdit.findPropData("locked");
      document.getElementById("comprop-locked").checked = elem.value;

      elem = this.mGenEdit.findPropData("material");
      if (elem)
        // this.mMateName.value = elem.value;
        util.selectMenuListByValue(this.mMateName, elem.value);
      else
        this.mMateName.disabled = true;

      elem = this.mGenEdit.findPropData("alpha");
      if (elem)
        this.mAlpha.value = elem.value;
      else
        this.mAlpha.disabled = true;

      //////////////////
      // Edge lines

      elem = this.mGenEdit.findPropData("egtype");
      util.selectMenuListByValue(this.mEdgeType, elem.value);

      elem = this.mGenEdit.findPropData("eglinew");
      this.mEgLinew.value = elem.value;

      elem = this.mGenEdit.findPropData("egcolor");
      this.mEgLineCol.setColorText(elem.value);

      this.updateEnabledState();

      dd("CommPropTab update OK");
    };

    klass.updateEnabledState = function ()
    {
      if (this.mEdgeType.value=="none") {
        this.mEgLinew.disabled = true;
        this.mEgLineCol.disabled = true;
      }
      else {
        this.mEgLinew.disabled = false;
        this.mEgLineCol.disabled = false;
      }
    };

    /// Widget --> Intrn-data
    klass.validateWidgets = function (aEvent)
    {
      var tgt_id = null;
      var new_val;
      if (aEvent)
        tgt_id = aEvent.currentTarget.id;

      dd("CommonProp> validate tgt_id="+tgt_id);
      if (tgt_id=="comprop-name" || tgt_id==null) {
        new_val = this.mRendName.value;
        this.mGenEdit.updateData("name", new_val);
      }

      if (tgt_id=="comprop-molsel" || tgt_id==null) {
        if (!this.mSelList.disabled) {
          new_val = this.mSelList.selectedSel;
          this.mGenEdit.updateData("sel", new_val.toString());
          this.mSelList.addHistorySel();
        }
      }

      if (tgt_id=="comprop-visible" || tgt_id==null) {
        new_val = document.getElementById("comprop-visible").checked;
        this.mGenEdit.updateData("visible", new_val);
      }

      if (tgt_id=="comprop-locked" || tgt_id==null) {
        new_val = document.getElementById("comprop-locked").checked;
        this.mGenEdit.updateData("locked", new_val);
      }

      if (tgt_id=="comprop-material" || tgt_id==null) {
        if (!this.mMateName.disabled) {
          new_val = this.mMateName.value;
          this.mGenEdit.updateData("material", new_val);
        }
      }

      if (tgt_id=="comprop-alpha" || tgt_id==null) {
        if (!this.mAlpha.disabled) {
          var new_val = parseFloat(this.mAlpha.value);
          if (isNaN(new_val) || new_val<=0.0 || new_val>1.0) return;
          this.mGenEdit.updateData("alpha", new_val);
        }
      }

      //////////////////
      // Edge lines

      if (tgt_id=="comprop-edgetype" || tgt_id==null) {
        this.updateEnabledState();
        new_val = this.mEdgeType.value;
        this.mGenEdit.updateData("egtype", new_val);
      }

      if (tgt_id=="comprop-eglinew" || tgt_id==null) {
        new_val = parseFloat(this.mEgLinew.value);
        if (!isNaN(new_val) && new_val>=0.0 && new_val<=1.0)
          this.mGenEdit.updateData("eglinew", new_val);
      }

      if (tgt_id=="comprop-eglinecol" || tgt_id==null) {
        new_val = this.mEgLineCol.getColorText();
        this.mGenEdit.updateData("egcolor", new_val);
      }

    };

    klass.resetAll = function ()
    {
      this.mGenEdit.resetAllToDefault();
      // this.updateWidgets();
    };

    return ctor;

  } ) ();
}

///////////////////////////////////////
// Independent "page" version

if (!("RendCommPropPage" in cuemolui)) {

  cuemolui.RendCommPropPage = ( function () {

    var ctor = function (aMain)
    {
      this.mPropEdit = new cuemolui.RendCommPropEdit(aMain);
    };

    var klass = ctor.prototype;

    klass.onLoad = function ()
    {
      this.mPropEdit.onLoad();
    };

    klass.onActivate = function ()
    {
      this.mPropEdit.updateWidgets();
    };

    klass.onInactivate = function ()
    {
      dd("RendCommPropPage> Inactivated");
      this.mPropEdit.validateWidgets();
    };

    /// Intrn-data --> widget
    klass.updateWidgets = function ()
    {
      this.mPropEdit.updateWidgets();
    };

    /// Widget --> Intrn-data
    klass.validateWidgets = function ()
    {
      this.mPropEdit.validateWidgets();
    };

    klass.resetAll = function ()
    {
      this.mPropEdit.resetAll();
    };

    return ctor;

  } ) ();
}

