#include "QtCreateRendDlg.hpp"

#include <QtWidgets>
#include <qsys/SceneManager.cpp>

QtCreateRendDlg::QtCreateRendDlg(qlib::uid_t nSceneID, QWidget *parent /*= nullptr*/)
    : QDialog(parent), m_nSceneID(nSceneID)
{
    setWindowTitle(tr("Create renderer"));
    m_objNameEdit = new QLineEdit;

    // TO DO: impl
    m_rendTypeBox = new QComboBox;
    m_rendTypeBox->addItem("simple");
    m_rendTypeBox->addItem("trace");
    m_rendTypeBox->addItem("ribbon");
    m_rendTypeBox->addItem("cartoon");

    m_rendNameEdit = new QLineEdit;
    // TO DO: impl
    m_molSelBox = new QLineEdit;
    m_recenViewCbx = new QCheckBox(tr("&Recenter view:"));

    auto formLayout = new QFormLayout;
    formLayout->addRow(tr("&Object:"), m_objNameEdit);
    formLayout->addRow(tr("&Renderer type:"), m_rendTypeBox);
    formLayout->addRow(tr("&Renderer name:"), m_rendNameEdit);
    formLayout->addRow(tr("&Selection:"), m_molSelBox);
    formLayout->addRow(m_recenViewCbx);

    auto buttonBox = new QDialogButtonBox(
        QDialogButtonBox::Ok | QDialogButtonBox::Cancel, Qt::Horizontal);
    // buttonBox->button(QDialogButtonBox::Ok)->setText(tr(""));
    // buttonBox->button(QDialogButtonBox::Cancel)->setText(tr(""));

    QVBoxLayout *vbox = new QVBoxLayout;
    vbox->addLayout(formLayout);
    vbox->addWidget(buttonBox);
    vbox->setContentsMargins(20, 20, 20, 20);

    setLayout(vbox);

    connect(buttonBox, SIGNAL(accepted()), this, SLOT(accept()));
    connect(buttonBox, SIGNAL(rejected()), this, SLOT(reject()));

    connect(m_rendTypeBox, SIGNAL(currentIndexChanged(int)), this,
            SLOT(rendTypeBoxChanged(int)));

    // reset init state
    m_rendTypeBox->setCurrentIndex(0);
    rendTypeBoxChanged(0);
}

void QtCreateRendDlg::setObjectName(const qlib::LString &name)
{
    m_objNameEdit->setText(name.c_str());
}

qlib::LString QtCreateRendDlg::getObjectName() const
{
    auto val = m_objNameEdit->text();
    auto cval = val.toUtf8().constData();
    return qlib::LString(cval);
}

void QtCreateRendDlg::rendTypeBoxChanged(int isel)
{
    LOG_DPRINTLN("rendTypeBoxChanged %d", isel);
    setDefaultRendName();
}

qlib::LString QtCreateRendDlg::getRendTypeName() const
{
    int isel = m_rendTypeBox->currentIndex();
    if (isel < 0) return qlib::LString();
    auto selvalue = m_rendTypeBox->itemText(isel);
    return qlib::LString(selvalue.toUtf8().constData());
}

void QtCreateRendDlg::setDefaultRendName()
{
    auto selvalue = getRendTypeName();
    if (selvalue.isEmpty()) return;
    LOG_DPRINTLN("setDefaultRendName> selected item=%s", selvalue.c_str());
    if (selvalue.startsWith("*")) {
        selvalue = selvalue.right(1);
    }
    auto default_name = createDefaultRendName(selvalue);
    m_rendNameEdit->setText(default_name.c_str());
}

qlib::LString QtCreateRendDlg::createDefaultRendName(
    const qlib::LString &rend_type_name)
{
    LOG_DPRINTLN("setDefaultRendName> scene ID=%d", m_nSceneID);

    auto pScMgr = qsys::SceneManager::getInstance();
    auto pSc = pScMgr->getScene(m_nSceneID);
    for (int i = 1;; ++i) {
        auto s = LString::format("%s%d", rend_type_name.c_str(), i);
        if (pSc->getRendByName(s).isnull()) return s;
    }

    // Not reached
    return LString();
}
