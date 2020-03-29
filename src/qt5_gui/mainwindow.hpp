#pragma once

#include <QMainWindow>

// class MdiChild;
QT_BEGIN_NAMESPACE
class QAction;
class QMenu;
class QMdiArea;
class QMdiSubWindow;
class QTextEdit;
class QListWidget;

class QSplitter;
class QPlainTextEdit;
QT_END_NAMESPACE

class QtMolWidget;

#include <qlib/LLogEvent.hpp>

class MainWindow : public QMainWindow, public qlib::LLogEventListener
{
  Q_OBJECT

public:
  MainWindow();
  ~MainWindow();

  bool openFile(const QString &fileName);

protected:
  void closeEvent(QCloseEvent *event) override;

private slots:
  void newFile();
  void open();
  void save();
  void saveAs();
  void updateRecentFileActions();
  void openRecentFile();
#ifndef QT_NO_CLIPBOARD
  void cut();
  void copy();
  void paste();
#endif
  void about();
  void updateMenus();
  void updateWindowMenu();
  // MdiChild *createMdiChild();
  void switchLayoutDirection();

private:
  enum { MaxRecentFiles = 5 };

  void createWidgets();
  void createActions();
  void createStatusBar();
  void readSettings();
  void writeSettings();
  bool loadFile(const QString &fileName);
  static bool hasRecentFiles();
  void prependToRecentFiles(const QString &fileName);
  void setRecentFilesVisible(bool visible);
  // MdiChild *activeMdiChild() const;
  // QMdiSubWindow *findMdiChild(const QString &fileName) const;

  QMenu *windowMenu;
  QAction *newAct;
  QAction *saveAct;
  QAction *saveAsAct;
  QAction *recentFileActs[MaxRecentFiles];
  QAction *recentFileSeparator;
  QAction *recentFileSubMenuAct;
#ifndef QT_NO_CLIPBOARD
  QAction *cutAct;
  QAction *copyAct;
  QAction *pasteAct;
#endif
  QAction *closeAct;
  QAction *closeAllAct;
  QAction *tileAct;
  QAction *cascadeAct;
  QAction *nextAct;
  QAction *previousAct;
  QAction *windowMenuSeparatorAct;

  // QTextEdit *textEdit;
  // QListWidget *customerList;
  // QListWidget *paragraphsList;

  QPlainTextEdit *m_pLogWnd;
  QSplitter *m_pSplitter;

  int m_nSceneID, m_nViewID;
  void setupScene();

  int m_nLogListenerID;
  virtual void logAppended(qlib::LLogEvent &evt);

  // QtMolWidget *m_pMolWidget;
  QMdiArea *m_pTabWnd;

  QtMolWidget *createMolWidget();
  
};
