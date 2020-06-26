#include "QtCreateRendDlg.hpp"

#include <QtWidgets>

QtCreateRendDlg::QtCreateRendDlg(QWidget *parent /*= nullptr*/) : QDialog(parent)
{
    auto objNameEdit = new QLineEdit;
    // TO DO: impl
    auto rendTypeBox = new QLineEdit;
    auto rendNameEdit = new QLineEdit;
    // TO DO: impl
    auto molSelBox = new QLineEdit;
    auto recenViewCbx = new QCheckBox(tr("&Recenter view:"));

    auto formLayout = new QFormLayout;
    formLayout->addRow(tr("&Object:"), objNameEdit);
    formLayout->addRow(tr("&Renderer type:"), rendTypeBox);
    formLayout->addRow(tr("&Renderer name:"), rendNameEdit);
    formLayout->addRow(tr("&Selection:"), molSelBox);
    formLayout->addRow(recenViewCbx);

    auto buttonBox = new QDialogButtonBox(
        QDialogButtonBox::Ok | QDialogButtonBox::Cancel, Qt::Horizontal);
    // buttonBox->button(QDialogButtonBox::Ok)->setText(tr(""));
    // buttonBox->button(QDialogButtonBox::Cancel)->setText(tr(""));

    QVBoxLayout *vbox = new QVBoxLayout;
    vbox->addLayout(formLayout);
    vbox->addWidget(buttonBox);
    vbox->setContentsMargins(50, 50, 50, 50);

    setLayout(vbox);

    connect(buttonBox, SIGNAL(accepted()), this, SLOT(accept()));
    connect(buttonBox, SIGNAL(rejected()), this, SLOT(reject()));
}
