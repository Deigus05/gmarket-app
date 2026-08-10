import React, { useMemo } from 'react';

import { LegalDocumentScreen } from '@/components/LegalDocumentScreen';
import { useLocale } from '@/components/LocaleContext';

export default function TermosScreen() {
  const { t } = useLocale();

  const sections = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        return {
          title: t(`terms.s${n}Title`),
          body: t(`terms.s${n}Body`),
        };
      }),
    [t],
  );

  return (
    <LegalDocumentScreen
      title={t('terms.title')}
      updated={t('terms.updated')}
      intro={t('terms.intro')}
      sections={sections}
    />
  );
}
