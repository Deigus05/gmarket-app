import React, { useMemo } from 'react';

import { LegalDocumentScreen } from '@/components/LegalDocumentScreen';
import { useLocale } from '@/components/LocaleContext';

export default function RegulamentoGCoinScreen() {
  const { t } = useLocale();

  const sections = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        return {
          title: t(`gcoinRegulation.s${n}Title`),
          body: t(`gcoinRegulation.s${n}Body`),
        };
      }),
    [t],
  );

  return (
    <LegalDocumentScreen
      title={t('gcoinRegulation.title')}
      updated={t('gcoinRegulation.updated')}
      intro={t('gcoinRegulation.intro')}
      sections={sections}
    />
  );
}
