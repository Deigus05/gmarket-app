import React, { memo } from 'react';

import type { Product } from '@/components/api';
import { ProductRail } from './ProductRail';

type Props = {
  products: Product[];
};

export const ContinueWatching = memo(function ContinueWatching({ products }: Props) {
  return <ProductRail title="Continuar a ver" products={products} />;
});
