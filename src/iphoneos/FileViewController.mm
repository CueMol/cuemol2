// -*-Mode: objc;-*-

#import "FileViewController.hpp"
#import "ConfigViewController.hpp"
#import "CueMolAppDelegate.h"

@interface FileViewController ()
- (void)scanDocumentsFolder;
@end

@implementation FileViewController

//@synthesize menuList, myTableView, myModalViewController;

- (id)init
{
  return [super init];
}

- (void)dealloc
{
  [m_tableView release];
  [m_fileList release];

  // [menuList release];
  // if (self.myModalViewController != nil)
  // [myModalViewController release];
  
  [super dealloc];
}

- (void)viewDidLoad
{
  self.title = @"CueMol files";
		
  m_tableView=[[UITableView alloc] init];
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

  // Edit button
  self.navigationItem.rightBarButtonItem = self.editButtonItem;

  // Make Config button
  UIImage *img;
  if (UI_USER_INTERFACE_IDIOM() == UIUserInterfaceIdiomPad) {
    img = [UIImage imageNamed:@"config_btn.png"];
  }
  else {
    img = [UIImage imageNamed:@"config_btn_white.png"];
  }

  UIButton* btn = [[UIButton alloc] initWithFrame:CGRectMake(0,0,26,26)];
  [btn setImage: img forState:UIControlStateNormal];
  [btn addTarget:self
       action:@selector(configAction:)
       forControlEvents:UIControlEventTouchUpInside];
  UIBarButtonItem *configBtn = [[UIBarButtonItem alloc]
				 initWithCustomView:btn];
  [btn release];

  self.navigationItem.leftBarButtonItem = configBtn;
  [configBtn release];
}

- (void)viewDidUnload
{
  // self.m_tableView = nil;
  // self.menuList = nil;
}

- (void)viewWillAppear:(BOOL)animated
{
  self.navigationController.navigationBar.translucent = NO;
  self.navigationController.navigationBar.barStyle = UIBarStyleDefault;
  [self.navigationController setNavigationBarHidden:NO animated:YES];
  // [self.m_tableView deselectRowAtIndexPath:self.m_tableView.indexPathForSelectedRow animated:NO];
}

- (void) setEditing:(BOOL)editing animated:(BOOL)animated
{
  [super setEditing: editing animated: animated];
  [m_tableView setEditing:editing animated:animated];
}

- (BOOL)shouldAutorotateToInterfaceOrientation: (UIInterfaceOrientation)orientation
{
  return YES;
}

/// Add new table entry
- (BOOL)addNewEntry:(NSString*)aTitle path:(NSString*)aPath filetype:(NSString*)aType
{
  // check to avoid adding the same entry
  for (NSDictionary *file in m_fileList) {
    NSString* title = [file objectForKey:@"title"];    
    NSString* path = [file objectForKey:@"path"];    
    NSString* type = [file objectForKey:@"type"];    
    if ([title isEqualToString:aTitle] &&
	[path isEqualToString:aPath] &&
	[type isEqualToString:aType])
      return NO;
  }

  // new entry
  NSMutableDictionary *file0 = [NSMutableDictionary dictionary];
  [file0 setObject:aTitle forKey:@"title"];
  [file0 setObject:aPath forKey:@"path"];
  [file0 setObject:aType forKey:@"type"];
  [m_fileList addObject:file0];

  [m_tableView reloadData];
  return YES;
}

- (NSString*)getContentPath
{
  NSString *path = [NSHomeDirectory() stringByAppendingPathComponent:@"tmp"];
  path = [path stringByAppendingPathComponent:@"content.plist"];
  return path;
}

- (void)setupDefaultContent
{
  NSMutableArray *filelist = [NSMutableArray array];
  NSString *path;
  NSMutableDictionary *file0;

  // sample scene file (1)
  path = @"test1.qsl";
  path = [[NSBundle mainBundle] pathForResource:path ofType:@""];
  if (path!=nil) {
    file0 = [NSMutableDictionary dictionary];
    [file0 setObject:@"Sample scene file" forKey:@"title"];
    [file0 setObject:path forKey:@"path"];
    [file0 setObject:@"qsl" forKey:@"type"];
    [file0 setObject:@"yes" forKey:@"system"];
    [filelist addObject:file0];
  }

  // sample scene file (2)
  path = @"test.pdb";
  path = [[NSBundle mainBundle] pathForResource:path ofType:@""];
  if (path!=nil) {
    file0 = [NSMutableDictionary dictionary];
    [file0 setObject:@"Sample PDB file" forKey:@"title"];
    [file0 setObject:path forKey:@"path"];
    [file0 setObject:@"pdb" forKey:@"type"];
    [file0 setObject:@"yes" forKey:@"system"];
    [filelist addObject:file0];
  }

  m_fileList = [filelist retain];
}

/// save to content file
- (void)saveContent
{
  NSMutableArray *filelist = [NSMutableArray array];

  for (NSDictionary *file in filelist) {
    NSString* sys = [file objectForKey:@"system"];
    if ([sys isEqualToString: @"no"]) {
      continue;
    }
    [filelist addObject:file];
  }

  NSString *path = [self getContentPath];
  [filelist writeToFile:path atomically:YES];
  // [filelist release];
  NSLog(@"saveContent OK");
}

/// load from content file
- (void)loadContent
{
  NSString *path = [self getContentPath];
  NSFileManager *fmgr = [NSFileManager defaultManager];  
  if (![fmgr isReadableFileAtPath:path]) {
    // content file is not found --> make default data
    NSLog(@"ERROR: content file [%@] is not found.", path);
    [self setupDefaultContent];
    [self scanDocumentsFolder];
    return;
  }

  NSMutableArray *filelist = [NSMutableArray arrayWithContentsOfFile:path];
  if (filelist==nil) {
    // content file is corrupted --> make default data
    NSLog(@"ERROR: init content from content-file was failed!!");
    [self setupDefaultContent];
    [self scanDocumentsFolder];
    return;
  }

  [self setupDefaultContent];

  // check validity of the content
  for (NSDictionary *file in filelist) {
    NSString* title = [file objectForKey:@"title"];
    NSString* fpath = [file objectForKey:@"path"];
    if ([fmgr isReadableFileAtPath:fpath]) {
      [m_fileList addObject:file];
      NSLog(@"Title: %@, Path: %@ file retain %d OK", title, fpath, [file retainCount]);
    }
  }

  NSLog(@"loadContent OK");

  [self scanDocumentsFolder];
}

/// scan Documents folder
- (void)scanDocumentsFolder
{
  NSString *docsDir = [NSHomeDirectory() stringByAppendingPathComponent:  @"Documents"];
  //NSFileManager *localFileManager=[[NSFileManager alloc] init];
  NSFileManager *fileManager=[NSFileManager defaultManager];

  NSDirectoryEnumerator *dirEnum = [fileManager enumeratorAtPath:docsDir];
  [dirEnum skipDescendents];
  NSString *file;
  while (file = [dirEnum nextObject]) {
    NSString *ext = [file pathExtension];

    NSLog(@"ScanDoc> testFile: %@", file);

    /*if ([file isEqualToString:@"Inbox"]) {
      NSLog(@"ScanDoc> Inbox is skipped");
      [dirEnum skipDescendents];
      continue;
      }*/

    if ([ext isEqualToString: @"qsl"] ||
	[ext isEqualToString: @"pdb"]) {
      // process the document
      NSString *path = [docsDir stringByAppendingPathComponent:file];
      
      NSMutableDictionary *file0 = [NSMutableDictionary dictionary];
      [file0 setObject:file forKey:@"title"];
      [file0 setObject:path forKey:@"path"];
      [file0 setObject:ext forKey:@"type"];
      // [file0 setObject:@"yes" forKey:@"system"];
      [file0 setObject:@"no" forKey:@"system"];
      [m_fileList addObject:file0];

      NSLog(@"ScanDoc> File Added: %@", file);
    }

    //NSLog(@"Title: %@, Path: %@ file retain %d OK", title, fpath, [file retainCount]);
  }
  
  //[localFileManager release];
}

////////////////////////////////////////////////////////////
// Table view delegation methods

//- (CGFloat)tableView:(UITableView*)tableView 
//heightForRowAtIndexPath:(NSIndexPath*)indexPath
//{
//  return 50;
//}

- (void)tableView:(UITableView*)tableView 
didSelectRowAtIndexPath:(NSIndexPath*)indexPath
{
  // NSString* key  =[[m_folder allKeys] objectAtIndex:0];
  // NSArray*  files=[_folder objectForKey:key];
  NSDictionary* file  = [m_fileList objectAtIndex:indexPath.row];
  NSString* title = [file objectForKey:@"title"];    
  NSString* path = [file objectForKey:@"path"];    
  NSString* type = [file objectForKey:@"type"];    

  NSLog(@"Title: %@", title);
  NSLog(@"Path: %@", path);

  CueMolAppDelegate *app = [[UIApplication sharedApplication] delegate];
  [app enterScene:path filetype:type title:title];

  // delselect selection in the table view
  [m_tableView deselectRowAtIndexPath:
		 [m_tableView indexPathForSelectedRow] animated:YES];
}

//- (void)tableView:(UITableView*)tableView 
//accessoryButtonTappedForRowWithIndexPath:(NSIndexPath*)indexPath {
//  [self tableView:tableView didSelectRowAtIndexPath:indexPath];
//}

/// Number of files in the table view
- (NSInteger)tableView:(UITableView*)tableView numberOfRowsInSection:(NSInteger)section
{
  return m_fileList.count;
}

/// Make cell in the table
- (UITableViewCell*)tableView:(UITableView*)tableView 
	cellForRowAtIndexPath:(NSIndexPath*)indexPath
{
  static NSString *kCellIdentifier = @"cellID";

  // make new table cell if needed
  UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:kCellIdentifier];
  if (cell==nil) {
    cell=[[[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault 
				   reuseIdentifier:kCellIdentifier] autorelease];
  }
  NSDictionary* file = [m_fileList objectAtIndex:indexPath.row];
  NSString* title = [file objectForKey:@"title"];    
  // NSString* path = [file objectForKey:@"path"];    
  
  [cell.textLabel setText:title];
  cell.accessoryType=UITableViewCellAccessoryDetailDisclosureButton;

  return cell;
}

/// Get editable flag of the file
- (BOOL)tableView:(UITableView *)tableView canEditRowAtIndexPath:(NSIndexPath *)indexPath
{
  NSDictionary* file = [m_fileList objectAtIndex:indexPath.row];
  NSString* system = [file objectForKey:@"system"];    

  NSString* path = [file objectForKey:@"path"];    
  // NSLog(@"File %@ System=%@", path, system);

  if (system && [system isEqualToString: @"yes"])
    return NO;

  return YES;
}

- (void)tableView:(UITableView *)tableView
commitEditingStyle:(UITableViewCellEditingStyle)editingStyle
forRowAtIndexPath:(NSIndexPath *)indexPath
{
  if (editingStyle == UITableViewCellEditingStyleDelete) {
    NSUInteger n = indexPath.row;
    NSDictionary* file = [m_fileList objectAtIndex:n];

    NSString* path = [file objectForKey:@"path"];    
    NSLog(@"Remove File %@", path);

    NSFileManager *fileMgr=[NSFileManager defaultManager];
    NSError *error;
    if ([fileMgr removeItemAtPath:path error:&error] != YES)
      NSLog(@"Unable to delete file: %@", [error localizedDescription]);
 
    [m_fileList removeObjectAtIndex:n];
    [tableView deleteRowsAtIndexPaths:[NSArray arrayWithObject:indexPath]
	       withRowAnimation:UITableViewRowAnimationFade];
  }

  //else if (editingStyle == UITableViewCellEditingStyleInsert) {
  //}
} 

/// show config view
- (IBAction)configAction:(id)sender
{
  UIViewController *ctrl = [[ConfigViewController alloc] init];
  [self.navigationController pushViewController:ctrl animated:YES];
  [ctrl release];
}


@end

 
