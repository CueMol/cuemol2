#define NO_USING_QTYPES
#include <common.h>

#include "QtMolStructPanel.hpp"
#include "moc_QtMolStructPanel.cpp"

#include <QtWidgets>


QtMolStructPanel::QtMolStructPanel(QWidget *parent /*= nullptr*/)
{
  createWidgets();
}

QtMolStructPanel::~QtMolStructPanel()
{
}

void QtMolStructPanel::createWidgets()
{
  setWindowTitle(tr("MolStruct"));
  setObjectName("molstruct_panel");
  setAllowedAreas(Qt::LeftDockWidgetArea);

  /////

  QVBoxLayout *playout = new QVBoxLayout;

  /////

  auto &&pMolBox = new QComboBox();
  pMolBox->addItem("A");
  pMolBox->addItem("B");
  pMolBox->addItem("C");
  playout->addWidget(pMolBox);

  /////

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

  playout->addWidget(pSceneTreeView);

  /////

  QToolBar *ptoolbar = new QToolBar("Toolbar");
  ptoolbar->addAction("A");
  ptoolbar->addAction("B");
  ptoolbar->addAction("C");
  playout->addWidget(ptoolbar);

  QWidget *pw = new QWidget();
  pw->setLayout(playout);
  setWidget(pw);
}
