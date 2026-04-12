import React from 'react'
import { MolViewPane } from './components/MolViewPane'
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs'
import 'react-tabs/style/react-tabs.css'
import styles from './TabMolView.module.css'
import { useMolTab } from './hooks/useMolTab'

export const TabMolView: React.FC = () => {
  const { molTabEntries, setActiveTab } = useMolTab()

  const onSelectFn = (ind: number): void => {
    console.log('on select called!!!', ind)
    setActiveTab(ind)
  }

  console.log('molTabEntries.length:', molTabEntries.length)
  const tabs = molTabEntries.map((tab, i) => {
    return (
      <Tab key={i}>{tab.title}:{tab.active ? 1 : 0}</Tab>
    )
  })

  return (
    <div className={styles.tabMolView}>
      <Tabs className={styles.tabs} onSelect={onSelectFn}>
        <TabList className={styles.tabList}>
          {tabs}
          <Tab disabled>+</Tab>
        </TabList>
        {molTabEntries.map((_, i) => (
          <TabPanel key={i} />
        ))}
      </Tabs>
      <MolViewPane />
    </div>
  )
}
