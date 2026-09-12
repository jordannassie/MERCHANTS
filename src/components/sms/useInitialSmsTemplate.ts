'use client'

import { useEffect, useState } from 'react'
import { INITIAL_SMS_TEMPLATE } from '@/lib/outreach'

export function useInitialSmsTemplate(): string {
  const [template, setTemplate] = useState(INITIAL_SMS_TEMPLATE)

  useEffect(() => {
    fetch('/api/settings/sms-sequence')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (typeof data?.initial === 'string' && data.initial.trim()) {
          setTemplate(data.initial)
        }
      })
      .catch(() => {})
  }, [])

  return template
}
