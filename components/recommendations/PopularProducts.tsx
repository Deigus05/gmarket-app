import React, { memo } from 'react';

import type { Product } from '@/components/api';
import { ProductRail } from './ProductRail';

type Props = {
  products: Product[];
  title?: string;
  subtitle?: string;
};

export const PopularProducts = memo(function PopularProducts({
  products,
  title = 'Mais vendidos',
  subtitle,
}: Props) {
  return <ProductRail title={title} subtitle={subtitle} products={products} />;
});
