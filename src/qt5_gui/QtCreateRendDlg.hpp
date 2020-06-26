#pragma once

//#include <QWidget>
//#include <QDialog>
#include <QtWidgets>

class QCheckBox;
class QLabel;
class QErrorMessage;

class QtCreateRendDlg : public QDialog
{
    Q_OBJECT

public:
    QtCreateRendDlg(QWidget *parent = nullptr);
};
