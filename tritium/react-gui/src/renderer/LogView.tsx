import React, { useRef, useEffect, useState } from 'react'
import styles from './LogView.module.css'
import { useLogEvent } from './hooks/useLogEvent'

export function LogView(): React.JSX.Element {
  const [contents, setContents] = useState('')
  const preRef = useRef<HTMLPreElement>(null)

  useLogEvent((msg) => {
    setContents((c) => c + msg)
  })

  useEffect(() => {
    if (preRef.current) {
      const h = preRef.current.scrollHeight
      preRef.current.scrollTo(0, h)
    }
  }, [contents])

  return (
    <div className={styles.bottomContainer}>
      <pre className={styles.logContainer} ref={preRef}>
        {contents}
      </pre>
    </div>
  )
}
