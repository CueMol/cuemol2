#
#

package MakeTopparXML;

use Exporter;

@ISA = qw(Exporter);
@EXPORT = qw(makeXML append_list);

use strict;

our $ns;

my $debug=0;

##############

my $indent_level = 0;
sub printx($)
{
    my $arg = shift;
    my $i = $indent_level;
    while ($i--) {
	print "  ";
    }
    print "$arg\n";
}
sub enter
{
    ++$indent_level;
}
sub leave
{
    --$indent_level;
}

######################

sub append_list($$$)
{
    my $rhash = shift;
    my $key = shift;
    my $value = shift;

    if ($rhash->{$key}) {
	push(@{$rhash->{$key}}, $value);
    }
    else {
	$rhash->{$key} = [$value];
    }
}

######################

sub conv_attr($$)
{
    my $attr = shift;
    my $arg = shift;
    return "" unless ($arg);
    return "" if ($arg eq ".");

    return qq( $attr="$arg");
}

sub makeXML($$$)
{
    my $rtopo = shift;
    my $rlinks = shift;
    my $rparm = shift;

    print qq(<?xml version="1.0"?>\n);
    print "<toppar>\n";

    enter();
    printx "<topology>";
    foreach my $id (sort keys %{$rtopo}) {
	makexml_resid($rtopo->{$id});
    }
    printx "</topology>";
    leave();

    enter();
    printx "<links>";
    foreach my $id (sort keys %{$rlinks}) {
	makexml_link($rlinks->{$id});
    }
    printx "</links>";
    leave();

    enter();
    printx qq(<params ns="$ns">);
    makexml_atomparm($rparm->{"atoms"});
    # makexml_bondparm($parm{"bonds"});
    # makexml_angleparm($parm{"angles"});
    printx "</params>";
    leave();

    print "</toppar>\n";
}

sub makexml_resid($)
{
    my $resid = shift;

    my $id = $resid->{"id"};
    return unless ($id);

    enter;
    printx qq(<resid id="$id").
	conv_attr("three", $resid->{"three"}).
	conv_attr("desc", $resid->{"desc"}).
	conv_attr("group", $resid->{"group"}).
	conv_attr("pivot", $resid->{"pivot"}).
	">";
    enter;

    my $ratoms = $resid->{"atoms"};
    my $rbonds = $resid->{"bonds"};
    my $raliases = $resid->{"aliases"};

    if ($raliases && @{$raliases}) {
	printx qq(<synonyms>);
	enter;
	foreach my $i (@{$raliases}) {
	    # print "[".$i->{"type"}."]\n";
	    if ($i->{"type"} eq "resid") {
		my $val = $i->{"value"};
		printx qq(<synonym value="$val"/>);
	    }
	    elsif ($i->{"type"} eq "atom") {
		my $val = $i->{"value"};
		my $cname = $i->{"cname"};
		printx qq(<atom cname="$cname" value="$val"/>);
	    }
	}
	leave;
	printx qq(</synonyms>);
    }

    if ($ratoms && @{$ratoms}) {
	printx qq(<atoms ns="$ns">);
	enter;
	foreach my $i (@{$ratoms}) {
	    my $id = $i->{"id"};
	    my $elem = $i->{"elem"};
	    if ($elem) {
		$elem = qq(elem="$elem");
	    }
	    my $type = $i->{"type"};
	    my $chg = $i->{"chg"};
	    printx qq(<atom id="$id" $elem type="$type" charge="$chg"/>);
	}
	leave;
	printx qq(</atoms>);
    }

    if ($rbonds && @{$rbonds}) {
	printx qq(<bonds>);
	enter;
	foreach my $i (@{$rbonds}) {
	    my $id1 = $i->{"id1"};
	    my $id2 = $i->{"id2"};
	    my $type = $i->{"type"};
	    my $value = $i->{"value"};
	    my $esd = $i->{"esd"};
	    printx qq(<bond id1="$id1" id2="$id2" type="$type" value="$value" esd="$esd"/>);
	}
	leave;
	printx qq(</bonds>);
    }

    my $rrings = $resid->{"rings"};
    if ($rrings && @{$rrings}) {
	printx qq(<rings>);
	enter;
	foreach my $i (@{$rrings}) {
	    printx qq(<ring value="$i"/>);
	}
	leave;
	printx qq(</rings>);
    }

    if ($resid->{"sidech"}) {
	printx qq(<sidech value=").$resid->{"sidech"}.qq("/>);
    }
    if ($resid->{"mainch"}) {
	printx qq(<mainch value=").$resid->{"mainch"}.qq("/>);
    }
    if ($resid->{"prop"}) {
	makexml_resprop($resid->{"prop"});
    }

    leave;
    printx qq(</resid>);
    leave;
    printx "";
}

sub makexml_resprop($)
{
    my $rprop = shift;

    foreach my $name ( sort keys %{$rprop} ) {
	my $value = $rprop->{$name};
	printx qq(<prop name="$name" value="$value"/>);
    }
}

sub makexml_link($)
{
    my $link = shift;

    my $id = $link->{"id"};
    return unless ($id);

    enter;
    printx qq(<link id="$id">);
    enter;

    my $rtargets = $link->{"targets"};
    my $rbonds = $link->{"bonds"};

    if ($rtargets && @{$rtargets}) {
	printx qq(<targets>);
	enter;
	foreach my $i (@{$rtargets}) {
	    my $resid1 = ($i->{"resid1"} eq ".")?"":" resid1=\"".$i->{"resid1"}."\"";
	    my $resid2 = ($i->{"resid2"} eq ".")?"":" resid2=\"".$i->{"resid2"}."\"";
	    my $group1 = ($i->{"group1"} eq ".")?"":" group1=\"".$i->{"group1"}."\"";
	    my $group2 = ($i->{"group2"} eq ".")?"":" group2=\"".$i->{"group2"}."\"";
	    printx qq(<target$resid1$group1$resid2$group2/>);
	}
	leave;
	printx qq(</targets>);
    }

    if ($rbonds && @{$rbonds}) {
	printx qq(<bonds>);
	enter;
	foreach my $i (@{$rbonds}) {
	    my $id1 = $i->{"id1"};
	    my $id2 = $i->{"id2"};
	    my $type = $i->{"type"};
	    my $value = $i->{"value"};
	    my $esd = $i->{"esd"};
	    printx qq(<bond id1="$id1" id2="$id2" type="$type" value="$value" esd="$esd"/>);
	}
	leave;
	printx qq(</bonds>);
    }

    leave;
    printx qq(</link>);
    leave;
    printx "";
}

sub makexml_atomparm($)
{
    my $ratoms = shift;

    # print "[$ratoms]\n";
    # print "[@{$ratoms}]\n";
    return unless ($ratoms && @{$ratoms});

    enter;
    printx qq(<atoms>);
    enter;
    foreach my $i (@{$ratoms}) {
	my $id = $i->{"id"};

	printx qq(<atom id="$id").
	    conv_attr("elem", $i->{"elem"}).
	    conv_attr("mass", $i->{"mass"}).
	    conv_attr("hbon", $i->{"hbon"}).
	    conv_attr("vdwr", $i->{"vdwr"}).
	    conv_attr("vdwhr", $i->{"vdwhr"}).
	    conv_attr("ionr", $i->{"ionr"}).
	    conv_attr("valency", $i->{"valency"}).
	    conv_attr("hybr", $i->{"hybr"}).
	    "/>";
    }
    leave;
    printx qq(</atoms>);
    leave;
}

1;
