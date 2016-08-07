#!/usr/bin/perl

use FindBin;
use lib "$FindBin::RealBin";

use strict;

use MakeTopparXML;

my %topo;
my %parm;
my %links;

my $CCP4 = $ENV{"CCP4"};
my $mon_lib = "$CCP4/lib/data/monomers";
$MakeTopparXML::ns = "ccp4";

my @load_cifs = (
		"s/SCN.cif"

		# amino acids
#		"a/ALA.cif",
#		"a/ASP.cif",
#		"a/ASN.cif",
#		"c/CYS.cif",
#		"g/GLN.cif",
#		"g/GLY.cif",
#		"g/GLU.cif",
#		"p/PHE.cif",
#		"h/HIS.cif",
#		"i/ILE.cif",
#		"l/LYS.cif",
#		"l/LEU.cif",
#		"m/MET.cif",
#		"m/MSE.cif",
#		"p/PRO.cif",
#		"a/ARG.cif",
#		"s/SER.cif",
#		"t/THR.cif",
#		"v/VAL.cif",
#		"t/TRP.cif",
#		"t/TYR.cif",

		# nucleic acids
#		"a/AR.cif",
#		"a/AD.cif",
#		"c/CR.cif",
#		"c/CD.cif",
#		"g/GR.cif",
#		"g/GD.cif",
#		"t/TD.cif",
#		"u/UR.cif",

		# sugars
#		"n/NAG-B-D.cif",
#		"m/MAN-B-D.cif",
#		"g/GAL-B-D.cif",
#		"g/GLC-B-D.cif",
#		"f/FUC-A-L.cif",
#		"s/SIA.cif",

		# monomers
#		"h/HOH.cif",
#		"p/PO4.cif",
#		"s/SO4.cif",
#		"g/GOL.cif",
#		"e/EDO.cif",
#		"c/CIT.cif"
		);

foreach my $i (@load_cifs) {
    loadResid("$mon_lib/$i");
}

loadList("$mon_lib/list/mon_lib_list.cif");

loadParm("$mon_lib/ener_lib.cif");

MakeTopparXML::makeXML(\%topo, \%links, \%parm);

##############

sub loadResid($)
{
    my $fname = shift;
    open(IN, $fname) || die "$fname $?:$!";

    my $state = "none";

    my ($id,$three, $desc,$group);
    my $atomind = 0;
    my $bondind = 0;
    my $anglind = 0;
    my $diheind = 0;
    my $chirind = 0;
    my $planind = 0;

    my @atoms;
    my @bonds;

    while (<IN>) {
	chomp;
	next if (/^\#/);

	if (/^loop_/) {
	}
	elsif (/^data_comp_list/) {
	}
	elsif (/^_chem_comp\./) {
	    $state = "comp";
	    next;
	}
	elsif (/^_chem_comp_atom\./) {
	    $state = "atom";
	    next;
	}
	elsif (/^_chem_comp_tree\./) {
	    $state = "tree";
	    next;
	}
	elsif (/^_chem_comp_bond\./) {
	    $state = "bond";
	    next;
	}
	elsif (/^_chem_comp_angle\./) {
	    $state = "angle";
	    next;
	}
	elsif (/^_chem_comp_tor\./) {
	    $state = "tor";
	    next;
	}
	elsif (/^_chem_comp_chir\./) {
	    $state = "chir";
	    next;
	}
	elsif (/^_chem_comp_plane_atom\./) {
	    $state = "plane";
	    next;
	}
	elsif (/^_/) {
	    print STDERR "Unknown structure line: $_\n";
	    next;
	}

	# data line
	if ($state eq "comp") {
	    next unless (/^(\S+)\s+(\S+)\s+\'\s*(\S.+\S)\s*\'\s+(\S+)/);
	    $id = $1;
	    $topo{$id}->{"id"} = $1;
	    $topo{$id}->{"three"} = $2;
	    $topo{$id}->{"desc"} = $3;
	    $topo{$id}->{"group"} = $4;
	    if ($4 eq "DNA" || $4 eq "RNA") {
		$topo{$id}->{"group"} = "nucl";
	    }
	    if ($4 eq "L-peptide") {
		$topo{$id}->{"group"} = "prot";
	    }
	    # print "id=$id, 3let=$three, desc: $desc, group=$group\n";
	    next;
	}

	if ($state eq "atom") {
	    next unless (/^\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
	    die if ($1 ne $id);
	    $atoms[$atomind]->{"id"} = $2;
	    $atoms[$atomind]->{"elem"} = $3;
	    $atoms[$atomind]->{"type"} = $4;
	    $atoms[$atomind]->{"chg"} = $5;
	    ++$atomind;
	    next;
	}
	if ($state eq "bond") {
	    next unless (/^\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+([\d\.]+)\s+([\d\.]+)/);
	    die if ($1 ne $id);
	    $bonds[$bondind]->{"id1"} = $2;
	    $bonds[$bondind]->{"id2"} = $3;
	    $bonds[$bondind]->{"type"} = $4;
	    $bonds[$bondind]->{"value"} = $5;
	    $bonds[$bondind]->{"esd"} = $6;
	    ++$bondind;
	    next;
	}

    }

    close(IN);
    print STDERR "$fname OK\n";

    $topo{$id}->{"atoms"} = \@atoms;
    $topo{$id}->{"bonds"} = \@bonds;

}

sub loadList($)
{
    my $fname = shift;
    open(IN, $fname) || die "$fname $?:$!";

    my $state = "none";
    my $nali = 0;

    my ($link_id, $link_comp1, $link_mod1, $link_grp1,
	$link_comp2, $link_mod2, $link_grp2, $link_name);


    while (<IN>) {
	chomp;
	next if (/^\#/);

	if (/^loop_/||/^global_/||/^_lib_/) {
	    next;
	}
	elsif (/^data_comp/||/^data_link/||/^data_mod_list/) {
	    next;
	}
	elsif (/^_chem_comp_synonym\./) {
	    $state = "compsyn";
	    next;
	}
	elsif (/^_chem_comp_synonym_atom\./) {
	    $state = "atomsyn";
	    next;
	}
	elsif (/^_chem_link\./) {
	    $state = "link";
	    next;
	}
	elsif (/^_chem_link_bond\./) {
	    $state = "linkbond";
	    next;
	}
	elsif (/^_/) {
	    # print STDERR "Unknown structure line: $_\n";
	    next;
	}

	# data line
	if ($state eq "compsyn") {
	    next unless (/^(\S+)\s+(\S+)\s+(\S+)/);
	    my $id = $1;
	    my $resid = $topo{$id};
	    if (!$resid) {
		$resid = $topo{$id} = {"id"=>$id};
	    }

	    my $value = {"type"=>"resid",
			 "value"=>$2};

	    append_list($resid, "aliases", $value);
	    print STDERR "Alias resid=$id, name=$2\n";
	    next;
	}

	if ($state eq "atomsyn") {
	    unless (/^(\S+)\s+(\S+)\s+(\S+)\s+\'(\S+)\'$/) {
		next unless (/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
	    }
	    my $id = $1;
	    my $resid = $topo{$id};
	    $resid = $topo{$id} = {"id"=>$id} unless ($resid);

	    my $value = {"type"=>"atom",
			 "cname"=>$3,
			 "value"=>$4};

	    if ($resid->{"aliases"}) {
		push(@{$resid->{"aliases"}}, $value);
	    }
	    else {
		$resid->{"aliases"} = [$value];
	    }

	    next;
	}

	if ($state eq "link") {
	    if (/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/) {
		$link_id = $1;

		$link_comp1 = $2;
		$link_mod1 = $3;
		$link_grp1 = $4;

		$link_comp2 = $5;
		$link_mod2 = $6;
		$link_grp2 = $7;

		next;
	    }
	    next unless (/^\s*(\S+)\s*$/);

	    my $id = $link_id;
	    my $link = $links{$id};
	    if (!$link) {
		$link = $links{$id} = {"id"=>$id};
	    }

	    if ($link_grp1 eq "DNA/RNA") {
		$link_grp1 = "nucl";
	    }
	    if ($link_grp2 eq "DNA/RNA") {
		$link_grp2 = "nucl";
	    }

	    if ($link_grp1 eq "peptide") {
		$link_grp1 = "prot";
	    }
	    if ($link_grp2 eq "peptide") {
		$link_grp2 = "prot";
	    }

	    my $value = {
		"resid1"=>$link_comp1,
		"mod1"=>$link_mod1,
		"group1"=>$link_grp1,
		"resid2"=>$link_comp2,
		"mod2"=>$link_mod2,
		"group2"=>$link_grp2
		};

	    append_list($link, "targets", $value);
	    print STDERR "Linkage $id\n";
	    next;
	}

	if ($state eq "linkbond") {
	    next unless (/^\s*(\S+)\s+(\d)\s+(\S+)\s+(\d)\s+(\S+)\s+(\S+)\s+([\d\.]+)\s+([\d\.]+)/);

	    my $id = $1;

	    my $num1 = $2;
	    my $id1 = $3;
	    my $num2 = $4;
	    my $id2 = $5;
	    my $type = $6;
	    my $val = $7;
	    my $esd = $8;

	    my $link = $links{$id};
	    if (!$link) {
		$link = $links{$id} = {"id"=>$id};
	    }

	    my $value = {
		"id1"=>$id1,
		"id2"=>$id2,
		"type"=>$type,
		"value"=>$val,
		"esd"=>$esd
		};
	    $value->{"comp1"} = $num1 if ($num1 ne "1");
	    $value->{"comp2"} = $num1 if ($num2 ne "2");
	    
	    if ($link->{"bonds"}) {
		push(@{$link->{"bonds"}}, $value);
	    }
	    else {
		$link->{"bonds"} = [$value];
	    }
	    next;
	}

    }

    close(IN);
    print STDERR "$fname OK\n";
}


sub loadParm($)
{
    my $fname = shift;
    open(IN, $fname) || die "$fname $?:$!";

    my $state = "none";
    my $atomind = 0;

    while (<IN>) {
	chomp;
	next if (/^\#/);

	if (/^loop_/) {
	    $state = "none";
	    next;
	}
	elsif (/^data_energy/) {
	    next;
	}
	elsif (/^_lib_atom\./) {
	    $state = "atom";
	    next;
	}
	elsif (/^_lib_bond\./) {
	    $state = "bond";
	    next;
	}
	elsif (/^_/) {
	    # print STDERR "Unknown structure line: $_\n";
	    next;
	}

	# data lines
	if ($state eq "atom") {
	    next unless (/^\s*(\S+)\s+([\d\.]+)\s+(\S+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+(\S+)\s+([\d\.]+)\s+([\d\.]+)/);
	    my $id = $1;
	    next if ($id eq ".");

	    my $elem = $7;
	    if (length($elem)==2) {
		$elem = substr($elem, 0, 1) . lc(substr($elem, 1, 1));
	    }
	    my $value = {"id"=>$id,
			 "mass"=>$2,
			 "hbon"=>$3,
			 "vdwr"=>$4,
			 "vdwhr"=>$5,
			 "ionr"=>$6,
			 "elem"=>$elem,
			 "valency"=>$8};
	    if ($9 eq ".") {
		$value->{"hybr"} = "";
	    }
	    else {
		$value->{"hybr"} = "sp$9";
	    }
			 
	    $parm{"atoms"}->[$atomind] = $value;
	    # print STDERR "ATOM $id [".$parm{"atoms"}."]\n";
	    ++$atomind;
	    next;
	}

	if ($state eq "bond") {
	    next unless (/^\s*(\S+)\s+(\S+)\s+(\S+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)/);
	    my $id1 = $1;
	    my $id2 = $2;
	    next if ($id1 eq "." || $id2 eq "." );

	    # TO DO: impl
	    next;
	}
    }

    close(IN);
    print STDERR "$fname OK\n";
}

