//
// Start-up scripts for CLI/external JS
//

//
// Register native objects
//
var cuemol = {};

var json = getAllClassNamesJSON();
var obj, clsname;
eval("obj = "+json);

for (var i in obj) {
    clsname = obj[i];
    // print("def class="+clsname);
    cuemol[clsname] = 
	( function (anm) {
	    var nm = anm;
	    return function() {
		// print("call ctor "+nm);
		return newObj(nm);
	    }
	} ) (clsname);
}

//
// setup cmdline args
//
var sys = {};
sys.argv = new Array();
var n = getCmdArgs(-1);
// print("nargs="+n);
for (var i=0; i<n; ++i) {
    var str = getCmdArgs(i);
    // print("arg"+i+"="+str);
    sys.argv.push(str);
}

//
// load utils.js
//
exec("utils.js");

