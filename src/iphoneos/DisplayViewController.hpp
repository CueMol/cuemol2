// -*-Mode: objc;-*-
//
// Display (show/hide) view controller
//

#import <UIKit/UIKit.h>

@interface DisplayViewController : UIViewController <UITableViewDelegate,
						  UITableViewDataSource>
{
  UITableView *m_tableView;
  NSMutableArray *m_objList;
  NSMutableArray *m_camList;
  int m_nSceneID;
}

// - (BOOL)addNewEntry:(NSString*)title path:(NSString*)aPath filetype:(NSString*)aType;
// - (void)saveContent;
// - (void)loadContent;

- (void)setupWithSceneID:(int)nSceneID;

@end
