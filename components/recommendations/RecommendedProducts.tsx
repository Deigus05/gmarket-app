import React, { memo } from 'react';

import type { Product } from '@/components/api';
import { ProductRail } from './ProductRail';

type Props = {
  products: Product[];
  title?: string;
};

export const RecommendedProducts = memo(function RecommendedProducts({
  products,
  title = 'Recomendado para si',
}: Props) {
  return <ProductRail title={title} products={products} />;
});
