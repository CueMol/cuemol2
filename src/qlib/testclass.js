var t = createObject("ClassA");
print("***** ClassA object: " + t);

var val;

t.prop0 = true;
val = t.prop0;
print("***** get boolprop: " + val + " should be true");

t.prop1 = 3245;
val = t.prop1;
print("***** get intprop: " + val + " should be 3245");

t.realprop = 325.14643;
val = t.realprop;
print("***** get realprop: " + val + " should be 325.14643");

t.vecprop.set_xyz(0.1, 0.3, 1.5);

