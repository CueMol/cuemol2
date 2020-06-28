#pragma once
#define NO_USING_QTYPES

//#include <QWidget>
//#include <QDialog>
#include <QtWidgets>
#include <qlib/LString.hpp>

class QCheckBox;
class QLabel;

class QtCreateRendDlg : public QDialog
{
    Q_OBJECT

private:
    QLineEdit *m_objNameEdit;

    QComboBox *m_rendTypeBox;

    QLineEdit *m_rendNameEdit;

    QLineEdit *m_molSelBox;
    QCheckBox *m_recenViewCbx;

    qlib::uid_t m_nSceneID;

public:
    QtCreateRendDlg(qlib::uid_t nSceneID, QWidget *parent = nullptr);

    void initRendTypeBox(const qlib::LStringList &rend_types);

    void setObjectName(const qlib::LString &name);
    qlib::LString getObjectName() const;

    qlib::LString getRendTypeName() const;

    qlib::LString getRendName() const
    {
        return qlib::LString(m_rendNameEdit->text().toUtf8().constData());
    }

    qlib::LString getMolSelStr() const
    {
        return qlib::LString(m_molSelBox->text().toUtf8().constData());
    }

    bool isRecenView() const
    {
        return m_recenViewCbx->isChecked();
    }

    // void setSceneID(qlib::uid_t id)
    // {
    //     m_nSceneID = id;
    // }
    qlib::uid_t getSceneID() const
    {
        return m_nSceneID;
    }

    void setDefaultRendName();
    qlib::LString createDefaultRendName(const qlib::LString &rend_type_name);

private slots:
    void rendTypeBoxChanged(int isel);
};
