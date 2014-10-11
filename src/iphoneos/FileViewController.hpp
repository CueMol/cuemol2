// -*-Mode: objc;-*-
//
// File view controller
//

#import <UIKit/UIKit.h>

// UINavigationBarDelegate,

@interface FileViewController : UIViewController <UITableViewDelegate,
						  UITableViewDataSource>
{
  UITableView *m_tableView;
  NSMutableArray *m_fileList;
	
  // ModalViewController *myModalViewController;
}

- (BOOL)addNewEntry:(NSString*)title path:(NSString*)aPath filetype:(NSString*)aType;
- (void)saveContent;
- (void)loadContent;

@end
