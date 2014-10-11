// -*-Mode: objc;-*-
//
// Config view controller
//

#import <UIKit/UIKit.h>

@interface ConfigViewController : UIViewController <UITableViewDelegate,
						    UITableViewDataSource>
{
  UITableView *m_tableView;
}

@end

///////////////////////////////////////////////////////////////////////////

@interface SpinCfgViewController : UIViewController <UITableViewDelegate,
						       UITableViewDataSource>
{
  UITableView *m_tableView;
  int m_nSpeed;
  int m_nSelected;
}

@end
