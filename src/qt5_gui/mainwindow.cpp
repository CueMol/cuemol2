#define NO_USING_QTYPES
#include <common.h>

#include <QtWidgets>
#include <QPlainTextEdit>
#include <QFontDatabase>

#include "mainwindow.hpp"
#include "moc_mainwindow.cpp"
#include "QtMolWidget.hpp"
#include <qsys/SceneManager.hpp>
#include <qsys/StreamManager.hpp>
#include <qsys/SceneXMLReader.hpp>
#include <qlib/LMsgLog.hpp>

using qsys::SceneManager;

MainWindow::MainWindow()
{
  setupScene();

  createWidgets();

  createActions();
  createStatusBar();
  //createDockWindows();
  updateMenus();

  readSettings();

  setUnifiedTitleAndToolBarOnMac(true);

  auto pLogMgr = qlib::LMsgLog::getInstance();
  auto msg = pLogMgr->getAccumMsg();
  pLogMgr->removeAccumMsg();
  m_pLogWnd->appendPlainText(msg.c_str());
  m_nLogListenerID = pLogMgr->addListener(this);
}

MainWindow::~MainWindow()
{
  auto pLogMgr = qlib::LMsgLog::getInstance();
  pLogMgr->removeListener(m_nLogListenerID);
}

void MainWindow::createWidgets()
{
  m_pMolWidget = new QtMolWidget();
  m_pMolWidget->bind(m_nSceneID, m_nViewID);

  m_pLogWnd = new QPlainTextEdit();
  m_pLogWnd->setReadOnly(true);
  m_pLogWnd->setMinimumSize(1, 1);
  auto&& fixedFont = QFontDatabase::systemFont(QFontDatabase::FixedFont);
  m_pLogWnd->setFont(fixedFont);
  
  m_pSplitter = new QSplitter(Qt::Vertical);
  m_pSplitter->addWidget(m_pMolWidget);
  m_pSplitter->addWidget(m_pLogWnd);
  
  m_pSplitter->setStretchFactor(0, 20);
  m_pSplitter->setStretchFactor(1, 1);

  // setCentralWidget(m_pMolWidget);
  setCentralWidget(m_pSplitter);
}

void MainWindow::setupScene()
{
  auto pScMgr = SceneManager::getInstance();
  auto pSc = pScMgr->createScene();
  // TO DO: locale dependent
  pSc->setName("Untitled");
  m_nSceneID = pSc->getUID();

  auto pView = pSc->createView();
  pView->setName("0");
  m_nViewID = pView->getUID();

  LOG_DPRINTLN("scene %d view %d created.", m_nSceneID, m_nViewID);
}

void MainWindow::logAppended(qlib::LLogEvent &evt)
{
  auto&& msg = evt.getMessage();
  m_pLogWnd->appendPlainText(msg.c_str());
  m_pLogWnd->verticalScrollBar()->setValue(m_pLogWnd->verticalScrollBar()->maximum());
}

//////////

void MainWindow::closeEvent(QCloseEvent *event)
{
  writeSettings();
  event->accept();
}

void MainWindow::newFile()
{
}

void MainWindow::open()
{
  const QString fileName = QFileDialog::getOpenFileName(this, "Open scene file", "", "CueMol Scene (*.qsc)");
  if (!fileName.isEmpty())
    openFile(fileName);
}

bool MainWindow::openFile(const QString &fileName)
{
  const bool succeeded = loadFile(fileName);
  if (succeeded)
    statusBar()->showMessage(tr("File loaded"), 2000);
  return succeeded;
}

bool MainWindow::loadFile(const QString &fileName)
{
  auto scMgr = SceneManager::getInstance();
  auto scene = scMgr->getScene(m_nSceneID);
  scene->clearAllData();

  auto strMgr = qsys::StreamManager::getInstance();
  qsys::SceneXMLReaderPtr reader = strMgr->createHandler("qsc_xml", 3);
  auto utf8fname = fileName.toUtf8();
  reader->setPath(utf8fname.constData());

  reader->attach(scene);
  reader->read();
  reader->detach();

  scene->loadViewFromCam(m_nViewID, "__current");

  m_pMolWidget->update();

  return true;
}

static inline QString recentFilesKey() { return QStringLiteral("recentFileList"); }
static inline QString fileKey() { return QStringLiteral("file"); }

static QStringList readRecentFiles(QSettings &settings)
{
  QStringList result;
  const int count = settings.beginReadArray(recentFilesKey());
  for (int i = 0; i < count; ++i) {
    settings.setArrayIndex(i);
    result.append(settings.value(fileKey()).toString());
  }
  settings.endArray();
  return result;
}

static void writeRecentFiles(const QStringList &files, QSettings &settings)
{
  const int count = files.size();
  settings.beginWriteArray(recentFilesKey());
  for (int i = 0; i < count; ++i) {
    settings.setArrayIndex(i);
    settings.setValue(fileKey(), files.at(i));
  }
  settings.endArray();
}

bool MainWindow::hasRecentFiles()
{
  QSettings settings(QCoreApplication::organizationName(), QCoreApplication::applicationName());
  const int count = settings.beginReadArray(recentFilesKey());
  settings.endArray();
  return count > 0;
}

void MainWindow::prependToRecentFiles(const QString &fileName)
{
  QSettings settings(QCoreApplication::organizationName(), QCoreApplication::applicationName());

  const QStringList oldRecentFiles = readRecentFiles(settings);
  QStringList recentFiles = oldRecentFiles;
  recentFiles.removeAll(fileName);
  recentFiles.prepend(fileName);
  if (oldRecentFiles != recentFiles)
    writeRecentFiles(recentFiles, settings);

  setRecentFilesVisible(!recentFiles.isEmpty());
}

void MainWindow::setRecentFilesVisible(bool visible)
{
  recentFileSubMenuAct->setVisible(visible);
  recentFileSeparator->setVisible(visible);
}

void MainWindow::updateRecentFileActions()
{
  QSettings settings(QCoreApplication::organizationName(), QCoreApplication::applicationName());

  const QStringList recentFiles = readRecentFiles(settings);
  const int count = qMin(int(MaxRecentFiles), recentFiles.size());
  int i = 0;
  for ( ; i < count; ++i) {
    const QString fileName = QFileInfo(recentFiles.at(i)).fileName();
    recentFileActs[i]->setText(tr("&%1 %2").arg(i + 1).arg(fileName));
    recentFileActs[i]->setData(recentFiles.at(i));
    recentFileActs[i]->setVisible(true);
  }
  for ( ; i < MaxRecentFiles; ++i)
    recentFileActs[i]->setVisible(false);
}

void MainWindow::openRecentFile()
{
  if (const QAction *action = qobject_cast<const QAction *>(sender()))
    openFile(action->data().toString());
}

void MainWindow::save()
{
}

void MainWindow::saveAs()
{
}

#ifndef QT_NO_CLIPBOARD
void MainWindow::cut()
{
}

void MainWindow::copy()
{
}

void MainWindow::paste()
{
}
#endif

void MainWindow::about()
{
  QMessageBox::about(this, tr("About MDI"),
		     tr("The <b>MDI</b> example demonstrates how to write multiple "
			"document interface applications using Qt."));
}

void MainWindow::updateMenus()
{

}

void MainWindow::updateWindowMenu()
{
  windowMenu->clear();
  windowMenu->addAction(closeAct);
  windowMenu->addAction(closeAllAct);
  windowMenu->addSeparator();
  windowMenu->addAction(tileAct);
  windowMenu->addAction(cascadeAct);
  windowMenu->addSeparator();
  windowMenu->addAction(nextAct);
  windowMenu->addAction(previousAct);
  windowMenu->addAction(windowMenuSeparatorAct);
}


void MainWindow::createActions()
{
  QMenu *fileMenu = menuBar()->addMenu(tr("&File"));
  // QToolBar *fileToolBar = addToolBar(tr("File"));
  // fileToolBar->setObjectName("fileToolBar");

  // const QIcon newIcon = QIcon::fromTheme("document-new", QIcon(":/images/new.png"));
  // newAct = new QAction(newIcon, tr("&New"), this);
  newAct = new QAction(tr("&New"), this);
  newAct->setShortcuts(QKeySequence::New);
  newAct->setStatusTip(tr("Create a new file"));
  connect(newAct, &QAction::triggered, this, &MainWindow::newFile);
  fileMenu->addAction(newAct);
  // fileToolBar->addAction(newAct);

  // const QIcon openIcon = QIcon::fromTheme("document-open", QIcon(":/images/open.png"));
  // QAction *openAct = new QAction(openIcon, tr("&Open..."), this);
  QAction *openAct = new QAction(tr("&Open..."), this);
  openAct->setShortcuts(QKeySequence::Open);
  openAct->setStatusTip(tr("Open an existing file"));
  connect(openAct, &QAction::triggered, this, &MainWindow::open);
  fileMenu->addAction(openAct);
  // fileToolBar->addAction(openAct);

  const QIcon exitIcon = QIcon::fromTheme("application-exit");
  QAction *exitAct = fileMenu->addAction(exitIcon, tr("E&xit"), qApp, &QApplication::closeAllWindows);
  exitAct->setShortcuts(QKeySequence::Quit);
  exitAct->setStatusTip(tr("Exit the application"));
  fileMenu->addAction(exitAct);
}

void MainWindow::createStatusBar()
{
  statusBar()->showMessage(tr("Ready"));
}

void MainWindow::readSettings()
{
  QSettings settings(QCoreApplication::organizationName(), QCoreApplication::applicationName());
  const QByteArray geometry = settings.value("geometry", QByteArray()).toByteArray();

  if (geometry.isEmpty()) {
    const QRect availableGeometry = screen()->availableGeometry();
    resize(availableGeometry.width() / 3, availableGeometry.height() / 2);
    move((availableGeometry.width() - width()) / 2,
	 (availableGeometry.height() - height()) / 2);
  } else {
    restoreGeometry(geometry);
  }

  const QByteArray state = settings.value("windowState", QByteArray()).toByteArray();
  if (!state.isEmpty()) {
    restoreState(state);
  }
}

void MainWindow::writeSettings()
{
  QSettings settings(QCoreApplication::organizationName(), QCoreApplication::applicationName());
  settings.setValue("geometry", saveGeometry());
  settings.setValue("windowState", saveState());
}


void MainWindow::switchLayoutDirection()
{
  if (layoutDirection() == Qt::LeftToRight)
    QGuiApplication::setLayoutDirection(Qt::RightToLeft);
  else
    QGuiApplication::setLayoutDirection(Qt::LeftToRight);
}

