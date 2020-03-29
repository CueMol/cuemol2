#define NO_USING_QTYPES
#include <common.h>

#include "QtScenePanel.hpp"
#include "moc_QtScenePanel.cpp"

#include <QtWidgets>


QtScenePanel::QtScenePanel(QWidget *parent /*= nullptr*/)
{
  createWidgets();
}

QtScenePanel::~QtScenePanel()
{
}

void QtScenePanel::createWidgets()
{
  setWindowTitle(tr("Scene"));
  setObjectName("workarea_panel");
  setAllowedAreas(Qt::LeftDockWidgetArea);
  auto pSceneTreeView = new QTreeView();
  pSceneTreeView->setAlternatingRowColors(true);
  pSceneTreeView->setHeaderHidden(false);

  QHeaderView *header_view = pSceneTreeView->header();
  QStandardItemModel *model = new QStandardItemModel();
  QStandardItem *root = new QStandardItem("root");
  header_view->sectionResizeMode(QHeaderView::ResizeToContents);
  model->appendRow(root);
  pSceneTreeView->setModel(model);
  pSceneTreeView->setRootIndex(root->index());

  {
    QStandardItem * childA0( new QStandardItem( "childA0" ) ) ;
    QStandardItem * childB0( new QStandardItem( "childB0" ) ) ;
    QList< QStandardItem * > childC_list ;
    QStandardItemModel * model( qobject_cast< QStandardItemModel * >( pSceneTreeView->model() ) ) ;
    QStandardItem * root( model->item( 0 ) ) ;
    childC_list.append( new QStandardItem( "childC0" ) ) ;
    childC_list.append( new QStandardItem( "childC1" ) ) ;
    childC_list.append( new QStandardItem( "childC2" ) ) ;
    root->removeRows( 0 , root->rowCount() ) ;
    root->appendRow( childA0 ) ;
    childA0->appendRow( childB0 ) ;
    childB0->appendRow( childC_list ) ;
  }

  QVBoxLayout *playout = new QVBoxLayout;
  playout->addWidget(pSceneTreeView);
  QToolBar *ptoolbar = new QToolBar("Toolbar");
  ptoolbar->addAction("A");
  ptoolbar->addAction("B");
  ptoolbar->addAction("C");
  playout->addWidget(ptoolbar);

  QWidget *pw = new QWidget();
  pw->setLayout(playout);
  setWidget(pw);
}
