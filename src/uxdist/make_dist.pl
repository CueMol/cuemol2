#!/usr/bin/perl

my $arch = "Linux-Intel64";
my $inst_top = $ARGV[0];
my $top_srcdir = $ARGV[1];
my $boost_dir = $ARGV[2];
my $xul_frm_dir = $ARGV[3];

##########

if (!-d $inst_top) {
    die "inst_top ($inst_top) not found.\n".
	"Usage: $0 <inst_top> <top_srcdir> <boost dir> <xulrunner-runtime dir>\n";
}
if (!-d $top_srcdir) {
    die "top_srcdir ($top_srcdir) not found.\n".
	"Usage: $0 <inst_top> <top_srcdir> <boost dir> <xulrunner-runtime dir>\n";
}

$boost_dir =~ s/^-L//;
if (!-d $boost_dir) {
    print "$boost_dir not found, use /usr/local instead ...\n";
    $boost_dir = "/usr/local/lib"
}
else {
    print "boost_dir: $boost_dir\n";
}

if (!-d $xul_frm_dir) {
    die "xul-sdk-dir ($xul_frm_dir) not found.\n".
	"Usage: $0 <inst_top> <top_srcdir> <boost dir> <xulrunner-runtime dir>\n";
}
print "xulrunner-runtime dir $xul_frm_dir\n";

##########

## my @lib_list = ("libqlib", "libqsys", "libgfx", "libmolstr", "libmolvis");

my @lib_list = ("libqmpng", "libqmzlib",
		"libqlib", "libqsys", "libgfx", "libjsbr", "libsysdep", 
		"libmolstr", "libmolvis", "libsymm", "libsurface", "libxtal",
		"libmdtools", "libmolanl", "liblwview",
		"libboost_thread", "libboost_system", "libboost_filesystem");

my @copylib = ("$boost_dir/libboost_thread*.so.*",
	       "$boost_dir/libboost_system*.so.*",
	       "$boost_dir/libboost_filesystem*.so.*",
);
my $RSYNC = "rsync";
my $CHRPATH = "chrpath";
my $chrpath_test = `which $CHRPATH`;
chomp($chrpath_test);
unless (-e $chrpath_test) {
    print "chrpath not found. --> cannot remove rpath\n";
    $CHRPATH = "";
}
print "CHRPATH OK (=$chrpath_test)\n";

##########

my $dist_top; 
open(IN, "$top_srcdir/version.hpp") || die "$?:$!";
while (<IN>) {
    if (/PRODUCTVER\s+(\d+),(\d+),(\d+),(\d+)/) {
	$dist_top = "CueMol2-$1.$2.$3.$4-$arch"; 
    }
}
close(IN);

print "output: $dist_top\n";

my $dist_topdir;
$dist_topdir = `pwd`;
chomp($dist_topdir);
$dist_topdir = $dist_topdir."/".$dist_top;

print "output: $dist_topdir\n";

#####

if (1) {
    if (-d $dist_top) {
	system("rm -rf $dist_top");
    }

    system("$RSYNC -v -a --copy-unsafe-links ".
	   "--cvs-exclude ".
	   "--exclude run_win.bat ".
	   "--exclude \"*.icns\" ".
	   "--exclude chrome/content/ ".
	   "--exclude chrome/locale/ ".
	   "--exclude defaults/preferences/debug-prefs.js ".
	   "--exclude jarmaker/ ".
	   "--exclude \"Makefile*\" ".
	   "--exclude \"*.la\" ".
	   "$inst_top/ $dist_top");

    if ($?) {
	print("result=<$?>\n");
	die "rsync failed.";
    }

    system("$RSYNC -v -a --copy-unsafe-links ".
	   "$xul_frm_dir/ $dist_top/xulrunner");

    if ($?) {
	print("result=<$?>\n");
	die "rsync failed.";
    }

}

#####

foreach my $libf (@copylib) {
    my $cmd = "install $libf $dist_top/lib/";
    print("$cmd\n");
    system($cmd);
    if ($?) {
	print("result=<$?>\n");
	die "install failed.";
    }
}

#####
# remove RPATH
#

if ($CHRPATH) {
    open(IN, "find $dist_top/bin $dist_top/lib -perm 0755 -type f -print |") || die "$!:$?";
    while (<IN>) {
	chomp;
	my $binfile = $_;
	
	my $cmd = "$CHRPATH --delete $binfile;";
	print ("$cmd\n");
	system($cmd);
    }
    close(IN);
}

#####
# strip bin
#
if (1) {
    open(IN, "find $dist_top -perm 0755 -type f -print |") || die "$!:$?";
    while (<IN>) {
	chomp;
	my $binfile = $_;
	
	my $cmd = "strip $binfile;";
	print ("$cmd\n");
	system($cmd);
    }
    close(IN);
}

system("install run_cuemol2.sh $dist_top/bin/cuemol2");

#####

if (1) {
    my $pkgcmd = "tar vcjf $dist_top.tar.bz2 $dist_top";
    print("$pkgcmd\n");
    system($pkgcmd); 
}

