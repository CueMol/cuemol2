// -*-Mode: objc;-*-


#import "ConfigViewController.hpp"

#include <common.h>
#include <qsys/SceneManager.hpp>

@implementation ConfigViewController

- (void)dealloc
{
  [m_tableView release];
  
  [super dealloc];
}

- (void)viewDidLoad
{
  self.title = @"Settings";

  m_tableView=[[UITableView alloc] initWithFrame:CGRectMake(0,0,1,1) style:UITableViewStyleGrouped];

  CGRect rect = self.view.frame;
  rect.origin.x = rect.origin.y = 0;
  [m_tableView setFrame:rect];
  [m_tableView setDelegate:self];                     
  [m_tableView setDataSource:self];
  [self.view addSubview:m_tableView];
  
  m_tableView.autoresizingMask= 
    UIViewAutoresizingFlexibleRightMargin| 
    UIViewAutoresizingFlexibleTopMargin|
    UIViewAutoresizingFlexibleLeftMargin|
    UIViewAutoresizingFlexibleBottomMargin|
    UIViewAutoresizingFlexibleWidth|
    UIViewAutoresizingFlexibleHeight;
}

- (void)viewDidUnload
{
}

-(void)viewWillAppear:(BOOL)animated
{
  if (m_tableView)
    [m_tableView reloadData];
  [super viewWillAppear:animated];
}

- (BOOL)shouldAutorotateToInterfaceOrientation: (UIInterfaceOrientation)orientation
{
  return YES;
}

////////////////////////////////////////////////////////////
// table view delegation

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
  return 2;
}

- (NSString *)tableView:(UITableView *)tableView titleForHeaderInSection:(NSInteger)section
{
  switch(section) {
  case 0:
    return @"About";
  case 1:
    return @"View";
  }
  return nil;
} 

- (NSInteger)tableView:(UITableView*)tableView numberOfRowsInSection:(NSInteger)section
{
  switch(section) {
  case 0:
    return 2;
  case 1:
    return 2;
  }    

  return 0;
}

// make cell in the table
- (UITableViewCell*)tableView:(UITableView*)tableView 
	cellForRowAtIndexPath:(NSIndexPath*)indexPath
{
  static NSString *kVerCellID = @"verCellID";
  static NSString *kSwCellID = @"viewCellID";
  static NSString *kSpinCfgCellID = @"spinCfgCellID";

  NSUInteger row = indexPath.row;
  NSUInteger section = indexPath.section;

  // make new table cell if needed

  UITableViewCell *cell;

  switch(section) {
  case 0: {
    // About/Version section
    cell = [tableView dequeueReusableCellWithIdentifier:kVerCellID];
    if (cell==nil) {
      cell=[[[UITableViewCell alloc] initWithStyle:UITableViewCellStyleValue1
				     reuseIdentifier:kVerCellID] autorelease];
      cell.selectionStyle = UITableViewCellSelectionStyleNone;
    }
    
    qsys::SceneManager *pMgr = qsys::SceneManager::getInstance();
    LString msg;
    if (row==0) {
      [cell.textLabel setText:@"Version"];
      msg = pMgr->getVersion();
    }
    else if (row==1) {
      [cell.textLabel setText:@"Build"];
      msg = pMgr->getBuildID();
    }
    NSString *nsmsg = [ [NSString alloc] initWithUTF8String:(msg.c_str()) ];
    [cell.detailTextLabel setText:nsmsg];
    break;
  }
  case 1: {
    // View Config section
    NSUserDefaults *pref = [NSUserDefaults standardUserDefaults];
    if (row==0) {
      // Momentum scroll config
      NSNumber* nsScrAnim = [pref objectForKey:@"scroll_anim"];

      cell = [tableView dequeueReusableCellWithIdentifier:kSwCellID];
      if (cell==nil) {
	cell=[[[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault
				       reuseIdentifier:kSwCellID] autorelease];
	cell.selectionStyle = UITableViewCellSelectionStyleNone;
      }
      UISwitch *switchObj = [[UISwitch alloc] initWithFrame:CGRectMake(1.0, 1.0, 20.0, 20.0)];

      if (nsScrAnim==nil) {
	switchObj.on = YES;
      }
      else {
	BOOL val = [nsScrAnim boolValue];
	MB_DPRINTLN("Config ScrAnim=%d", val);
	switchObj.on = val;
      }

      [switchObj addTarget:self
		 action:@selector(onSwitchScrAnim:)
		 forControlEvents:UIControlEventValueChanged];
      cell.accessoryView = switchObj;
      [switchObj release];
      [cell.textLabel setText:@"Momentum Scroll"];
    }
    else if (row==1) {
      // Ad-hoc Spin animation speed config
      NSNumber* spin_speed = [pref objectForKey:@"adhoc_spin_speed"];
      int nspeed = 5;
      if (spin_speed==nil) {
	// write pref with default value
	[pref setObject:[NSNumber numberWithInt:nspeed] forKey:@"adhoc_spin_speed"];
      }
      else {
	nspeed = [spin_speed intValue];
      }

      cell = [tableView dequeueReusableCellWithIdentifier:kSpinCfgCellID];
      if (cell==nil) {
	cell=[[[UITableViewCell alloc] initWithStyle:UITableViewCellStyleValue1
				       reuseIdentifier:kSpinCfgCellID] autorelease];
	//cell.selectionStyle = UITableViewCellSelectionStyleNone;
      }
      [cell.textLabel setText:@"Ad-hoc Spin Speed"];
      NSString *value = [NSString stringWithFormat:@"%d sec/spin", nspeed];
      [cell.detailTextLabel setText:value];
      cell.accessoryType = UITableViewCellAccessoryDisclosureIndicator;
    }
  }
  }    

  return cell;
}

- (void)tableView:(UITableView*)tableView 
didSelectRowAtIndexPath:(NSIndexPath*)indexPath
{
  NSUInteger row = indexPath.row;
  NSUInteger section = indexPath.section;

  if (section==1 && row==1) {
    // delselect selection in the table view
    [tableView deselectRowAtIndexPath:
		 [tableView indexPathForSelectedRow] animated:YES];
    // go down the spin-config view
    UIViewController *ctrl = [[SpinCfgViewController alloc] init];
    [self.navigationController pushViewController:ctrl animated:YES];
    [ctrl release];
  }
}

- (IBAction)onSwitchScrAnim:(id)sender
{
  NSUserDefaults *pref = [NSUserDefaults standardUserDefaults];
  UISwitch *switchObj = sender;
  [pref setObject:[NSNumber numberWithBool:switchObj.on] forKey:@"scroll_anim"];
}

@end

/////////////////////////////////////////////////////////////////////////////////////////////

@implementation SpinCfgViewController

- (void)dealloc
{
  [m_tableView release];
  [super dealloc];
}

- (void)viewDidLoad
{
  self.title = @"Spin animation speed";

  m_tableView=[[UITableView alloc] initWithFrame:CGRectMake(0,0,1,1) style:UITableViewStyleGrouped];

  CGRect rect = self.view.frame;
  rect.origin.x = rect.origin.y = 0;
  [m_tableView setFrame:rect];
  [m_tableView setDelegate:self];                     
  [m_tableView setDataSource:self];
  [self.view addSubview:m_tableView];
  
  m_tableView.autoresizingMask= 
    UIViewAutoresizingFlexibleRightMargin| 
    UIViewAutoresizingFlexibleTopMargin|
    UIViewAutoresizingFlexibleLeftMargin|
    UIViewAutoresizingFlexibleBottomMargin|
    UIViewAutoresizingFlexibleWidth|
    UIViewAutoresizingFlexibleHeight;

  // load value
  NSUserDefaults *pref = [NSUserDefaults standardUserDefaults];
  NSNumber* spin_speed = [pref objectForKey:@"adhoc_spin_speed"];
  m_nSpeed = [spin_speed intValue];
  m_nSelected = -1;
}

-(void)viewWillDisappear:(BOOL)animated
{
  // update the config data (spin_speed)
  NSUserDefaults *pref = [NSUserDefaults standardUserDefaults];
  [pref setObject:[NSNumber numberWithInt:m_nSpeed] forKey:@"adhoc_spin_speed"];

  [super viewWillDisappear:animated];
}

- (void)viewDidUnload
{
}

- (BOOL)shouldAutorotateToInterfaceOrientation: (UIInterfaceOrientation)orientation
{
  return YES;
}

////////////////////////////////////////////////////////////
// table view delegation

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView
{
  return 1;
}

- (NSString *)tableView:(UITableView *)tableView titleForHeaderInSection:(NSInteger)section
{
  return nil;
} 

- (NSInteger)tableView:(UITableView*)tableView numberOfRowsInSection:(NSInteger)section
{
  return 5;
}

int convRow2Speed(int nrow)
{
 switch (nrow) {
 case 0:
   return 1;
 case 1:
   return 3;
 case 2:
   return 5;
 case 3:
   return 10;
 case 4:
   return 15;
 }
 return -1;
}

// make cell in the table
- (UITableViewCell*)tableView:(UITableView*)tableView 
	cellForRowAtIndexPath:(NSIndexPath*)indexPath
{
  UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"Cell"];
  if (cell == nil) {
    cell = [[[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault reuseIdentifier:@"Cell"] autorelease];
  }

  cell.accessoryType = UITableViewCellAccessoryNone;
  cell.textLabel.textColor = [UIColor blackColor];

  NSUInteger row = indexPath.row;
  int nsp = convRow2Speed(row);
  if (nsp<0)
    return nil;

  [cell.textLabel setText:[NSString stringWithFormat:@"%d sec/spin", nsp]];
  if (m_nSpeed==nsp) {
    cell.accessoryType = UITableViewCellAccessoryCheckmark;
    cell.textLabel.textColor = [UIColor grayColor];
    m_nSelected = row;
  }

  return cell;
}

- (void)tableView:(UITableView*)tableView 
didSelectRowAtIndexPath:(NSIndexPath*)indexPath
{
  NSUInteger row = indexPath.row;
  //NSUInteger section = indexPath.section;

  int nsp = convRow2Speed(row);
  LOG_DPRINTLN("Selected row=%d, sp=%d", int(row), nsp);
  if (nsp<0)
    return;

  [tableView beginUpdates];
  m_nSpeed = nsp;

  [tableView reloadRowsAtIndexPaths:[NSArray arrayWithObject:indexPath]
	     withRowAnimation:UITableViewRowAnimationAutomatic];

  if (m_nSelected>=0 && m_nSelected!=row) {
    NSIndexPath* path = [NSIndexPath indexPathForRow:m_nSelected inSection:0];
    [tableView reloadRowsAtIndexPaths:[NSArray arrayWithObject:path]
	       withRowAnimation:UITableViewRowAnimationAutomatic];
  }

  // delselect selection in the table view
  [tableView deselectRowAtIndexPath:
	       [tableView indexPathForSelectedRow] animated:YES];

  [tableView endUpdates];
}

@end
