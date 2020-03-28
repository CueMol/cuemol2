#include <QApplication>
#include <QCommandLineParser>
#include <QCommandLineOption>

#include "mainwindow.hpp"

int main(int argc, char *argv[])
{
  // Q_INIT_RESOURCE(mdi);

  QApplication app(argc, argv);
  QCoreApplication::setApplicationName("CueMol2");
  QCoreApplication::setOrganizationName("CueMol");
  QCoreApplication::setApplicationVersion(QT_VERSION_STR);

  // QCommandLineParser parser;
  // parser.setApplicationDescription("Qt MDI Example");
  // parser.addHelpOption();
  // parser.addVersionOption();
  // parser.addPositionalArgument("file", "The file to open.");
  // parser.process(app);

  MainWindow mainWin;
  // const QStringList posArgs = parser.positionalArguments();
  // for (const QString &fileName : posArgs)
  //   mainWin.openFile(fileName);
  mainWin.show();
  return app.exec();
}
