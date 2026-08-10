import React, { useMemo } from 'react';

import { LegalDocumentScreen } from '@/components/LegalDocumentScreen';
import { useLocale } from '@/components/LocaleContext';

export default function PrivacidadeScreen() {
  const { t } = useLocale();

  const sections = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        return {
          title: t(`privacy.s${n}Title`),
          body: t(`privacy.s${n}Body`),
        };
      }),
    [t],
  );

  return (
    <LegalDocumentScreen
      title={t('privacy.title')}
      updated={t('privacy.updated')}
      intro={t('privacy.intro')}
      sections={sections}
    />
  );
}
