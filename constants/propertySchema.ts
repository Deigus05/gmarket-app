import type { PropertyAttribute, PropertyType } from '@/components/api';

type SeedAttr = Omit<PropertyAttribute, 'id'> & { id?: string };

function attr(
  key: string,
  label: string,
  attr_group: PropertyAttribute['attr_group'],
  input_type: PropertyAttribute['input_type'],
  opts: Partial<PropertyAttribute> = {},
): SeedAttr {
  return {
    id: `local-${key}`,
    key,
    label,
    attr_group,
    input_type,
    required: opts.required ?? false,
    options: opts.options ?? [],
    unit: opts.unit ?? null,
    show_in_main: opts.show_in_main ?? false,
    sort_order: opts.sort_order ?? 0,
  };
}

const CASA_ATTRS: SeedAttr[] = [
  attr('area_terreno', 'Área do terreno', 'info', 'number', { unit: 'm²', sort_order: 10 }),
  attr('area_construida', 'Área construída', 'info', 'number', { unit: 'm²', show_in_main: true, sort_order: 20 }),
  attr('quartos', 'Quartos', 'info', 'number', { required: true, show_in_main: true, sort_order: 30 }),
  attr('casas_banho', 'Casas de banho', 'info', 'number', { required: true, show_in_main: true, sort_order: 40 }),
  attr('salas', 'Salas', 'info', 'number', { sort_order: 50 }),
  attr('cozinha', 'Cozinha', 'info', 'number', { sort_order: 60 }),
  attr('garagem', 'Garagem', 'info', 'number', { show_in_main: true, sort_order: 70 }),
  attr('pisos', 'Número de pisos', 'info', 'number', { sort_order: 80 }),
  attr('ano_construcao', 'Ano de construção', 'info', 'number', { sort_order: 90 }),
  attr('jardim', 'Jardim', 'amenity', 'boolean', { sort_order: 100 }),
  attr('quintal', 'Quintal', 'amenity', 'boolean', { sort_order: 110 }),
  attr('piscina', 'Piscina', 'amenity', 'boolean', { sort_order: 120 }),
  attr('varanda', 'Varanda', 'amenity', 'boolean', { sort_order: 130 }),
  attr('terraco', 'Terraço', 'amenity', 'boolean', { sort_order: 140 }),
  attr('ar_condicionado', 'Ar condicionado', 'amenity', 'boolean', { sort_order: 150 }),
  attr('energia_eagb', 'Energia da EAGB', 'amenity', 'boolean', { sort_order: 160 }),
  attr('gerador', 'Gerador', 'amenity', 'boolean', { sort_order: 170 }),
  attr('paineis_solares', 'Painéis solares', 'amenity', 'boolean', { sort_order: 180 }),
  attr('reservatorio_agua', 'Reservatório de água', 'amenity', 'boolean', { sort_order: 190 }),
  attr('furo', 'Furo', 'amenity', 'boolean', { sort_order: 200 }),
  attr('internet', 'Internet', 'amenity', 'boolean', { sort_order: 210 }),
  attr('tv', 'TV', 'amenity', 'boolean', { sort_order: 220 }),
  attr('mobilada', 'Mobilada', 'amenity', 'boolean', { sort_order: 230 }),
  attr('seguranca', 'Segurança', 'amenity', 'boolean', { sort_order: 240 }),
];

const APARTAMENTO_ATTRS: SeedAttr[] = [
  attr('area', 'Área', 'info', 'number', { unit: 'm²', show_in_main: true, sort_order: 10 }),
  attr('quartos', 'Quartos', 'info', 'number', { required: true, show_in_main: true, sort_order: 20 }),
  attr('casas_banho', 'Casas de banho', 'info', 'number', { sort_order: 30 }),
  attr('andar', 'Andar', 'info', 'number', { show_in_main: true, sort_order: 40 }),
  attr('elevador', 'Elevador', 'info', 'boolean', { sort_order: 50 }),
  attr('garagem', 'Garagem', 'info', 'number', { sort_order: 60 }),
  attr('piscina', 'Piscina', 'amenity', 'boolean', { sort_order: 100 }),
  attr('ginasio', 'Ginásio', 'amenity', 'boolean', { sort_order: 110 }),
  attr('seguranca', 'Segurança', 'amenity', 'boolean', { sort_order: 120 }),
  attr('internet', 'Internet', 'amenity', 'boolean', { sort_order: 130 }),
  attr('mobilado', 'Mobilado', 'amenity', 'boolean', { sort_order: 140 }),
  attr('varanda', 'Varanda', 'amenity', 'boolean', { sort_order: 150 }),
  attr('gerador', 'Gerador', 'amenity', 'boolean', { sort_order: 160 }),
];

const HOTEL_ATTRS: SeedAttr[] = [
  attr('nome_hotel', 'Nome', 'info', 'text', { required: true, show_in_main: true, sort_order: 10 }),
  attr('estrelas', 'Categoria (estrelas)', 'info', 'select', {
    required: true,
    show_in_main: true,
    options: ['1', '2', '3', '4', '5'],
    sort_order: 20,
  }),
  attr('numero_quartos', 'Número de quartos', 'info', 'number', { sort_order: 30 }),
  attr('check_in', 'Check-in', 'info', 'text', { show_in_main: true, sort_order: 40 }),
  attr('check_out', 'Check-out', 'info', 'text', { show_in_main: true, sort_order: 50 }),
  attr('wifi', 'Wi-Fi', 'service', 'boolean', { sort_order: 100 }),
  attr('restaurante', 'Restaurante', 'service', 'boolean', { sort_order: 110 }),
  attr('bar', 'Bar', 'service', 'boolean', { sort_order: 120 }),
  attr('piscina', 'Piscina', 'service', 'boolean', { sort_order: 130 }),
  attr('lavandaria', 'Lavandaria', 'service', 'boolean', { sort_order: 140 }),
  attr('estacionamento', 'Estacionamento', 'service', 'boolean', { sort_order: 150 }),
  attr('pequeno_almoco', 'Pequeno-almoço', 'service', 'boolean', { sort_order: 160 }),
  attr('rececao_24h', 'Receção 24h', 'service', 'boolean', { sort_order: 170 }),
  attr('transporte', 'Transporte', 'service', 'boolean', { sort_order: 180 }),
  attr('ar_condicionado', 'Ar condicionado', 'service', 'boolean', { sort_order: 190 }),
];

const EVENTOS_ATTRS: SeedAttr[] = [
  attr('nome_espaco', 'Nome', 'info', 'text', { required: true, show_in_main: true, sort_order: 10 }),
  attr('tipo_evento', 'Tipo', 'info', 'select', {
    required: true,
    show_in_main: true,
    options: ['Casamento', 'Batizado', 'Festa', 'Conferência', 'Seminário', 'Concerto', 'Reunião'],
    sort_order: 20,
  }),
  attr('capacidade_min', 'Capacidade mínima', 'info', 'number', { sort_order: 30 }),
  attr('capacidade_max', 'Capacidade máxima', 'info', 'number', { required: true, show_in_main: true, sort_order: 40 }),
  attr('area', 'Área', 'info', 'number', { unit: 'm²', show_in_main: true, sort_order: 50 }),
  attr('mesas', 'Mesas', 'structure', 'boolean', { sort_order: 100 }),
  attr('cadeiras', 'Cadeiras', 'structure', 'boolean', { sort_order: 110 }),
  attr('palco', 'Palco', 'structure', 'boolean', { sort_order: 120 }),
  attr('sistema_som', 'Sistema de som', 'structure', 'boolean', { sort_order: 130 }),
  attr('projetor', 'Projetor', 'structure', 'boolean', { sort_order: 140 }),
  attr('ar_condicionado', 'Ar condicionado', 'structure', 'boolean', { sort_order: 150 }),
  attr('internet', 'Internet', 'structure', 'boolean', { sort_order: 160 }),
  attr('estacionamento', 'Estacionamento', 'structure', 'boolean', { sort_order: 170 }),
  attr('gerador', 'Gerador', 'structure', 'boolean', { sort_order: 180 }),
  attr('cozinha', 'Cozinha', 'structure', 'boolean', { sort_order: 190 }),
  attr('seguranca', 'Segurança', 'structure', 'boolean', { sort_order: 200 }),
];

const TERRENO_ATTRS: SeedAttr[] = [
  attr('area', 'Área', 'info', 'number', { required: true, unit: 'm²', show_in_main: true, sort_order: 10 }),
  attr('tipo_terreno', 'Tipo', 'info', 'select', {
    required: true,
    show_in_main: true,
    options: ['Urbano', 'Rural', 'Agrícola', 'Comercial'],
    sort_order: 20,
  }),
  attr('documentacao', 'Documentação', 'info', 'text', { sort_order: 30 }),
  attr('agua', 'Água', 'amenity', 'boolean', { sort_order: 100 }),
  attr('energia', 'Energia', 'amenity', 'boolean', { sort_order: 110 }),
  attr('murado', 'Murado', 'amenity', 'boolean', { sort_order: 120 }),
];

const COMERCIAL_ATTRS: SeedAttr[] = [
  attr('area', 'Área', 'info', 'number', { required: true, unit: 'm²', show_in_main: true, sort_order: 10 }),
  attr('numero_salas', 'Número de salas', 'info', 'number', { show_in_main: true, sort_order: 20 }),
  attr('casas_banho', 'Casas de banho', 'info', 'number', { sort_order: 30 }),
  attr('estacionamento', 'Estacionamento', 'amenity', 'boolean', { sort_order: 100 }),
  attr('internet', 'Internet', 'amenity', 'boolean', { sort_order: 110 }),
  attr('ar_condicionado', 'Ar condicionado', 'amenity', 'boolean', { sort_order: 120 }),
  attr('seguranca', 'Segurança', 'amenity', 'boolean', { sort_order: 130 }),
];

function typeOf(slug: string, name: string, sort_order: number, attributes: SeedAttr[]): PropertyType {
  const attrs = attributes.map((a, i) => ({
    ...a,
    id: a.id || `local-${slug}-${a.key}`,
    sort_order: a.sort_order || i,
  })) as PropertyAttribute[];
  return {
    id: `local-${slug}`,
    slug,
    name,
    sort_order,
    attributes: attrs,
    attributes_by_group: {
      info: attrs.filter((a) => a.attr_group === 'info'),
      amenity: attrs.filter((a) => a.attr_group === 'amenity'),
      structure: attrs.filter((a) => a.attr_group === 'structure'),
      service: attrs.filter((a) => a.attr_group === 'service'),
    },
  };
}

export const FALLBACK_PROPERTY_TYPES: PropertyType[] = [
  typeOf('casa', 'Casa', 1, CASA_ATTRS),
  typeOf('apartamento', 'Apartamento', 2, APARTAMENTO_ATTRS),
  typeOf('hotel', 'Hotel', 3, HOTEL_ATTRS),
  typeOf('espaco-eventos', 'Espaço para Eventos', 4, EVENTOS_ATTRS),
  typeOf('terreno', 'Terreno', 5, TERRENO_ATTRS),
  typeOf('escritorio', 'Escritório', 6, COMERCIAL_ATTRS),
  typeOf('loja-comercial', 'Loja Comercial', 7, COMERCIAL_ATTRS),
  typeOf('armazem', 'Armazém', 8, COMERCIAL_ATTRS),
];

export const PROPERTY_PURPOSES = [
  { key: 'venda', label: 'Venda' },
  { key: 'arrendamento', label: 'Arrendamento' },
] as const;

export const RENTAL_PERIODS = [
  { key: 'mensal', label: 'Mensal' },
  { key: 'diaria', label: 'Diária' },
] as const;

export const BEDROOM_FILTER_OPTIONS = [
  { key: '', label: 'Todos' },
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3', label: '3' },
  { key: '4', label: '4' },
  { key: '5', label: '5+' },
] as const;

export const FALLBACK_GB_REGIONS = [
  {
    id: 'bissau',
    slug: 'bissau',
    name: 'Bissau',
    sectors: [
      { id: '1', region_id: 'bissau', slug: 'cupelum', name: 'Cupelum' },
      { id: '2', region_id: 'bissau', slug: 'penha', name: 'Penha' },
      { id: '3', region_id: 'bissau', slug: 'bairro-militar', name: 'Bairro Militar' },
      { id: '4', region_id: 'bissau', slug: 'antula', name: 'Antula' },
    ],
  },
  {
    id: 'biombo',
    slug: 'biombo',
    name: 'Biombo',
    sectors: [
      { id: '5', region_id: 'biombo', slug: 'quinhamel', name: 'Quinhamel' },
      { id: '6', region_id: 'biombo', slug: 'prabis', name: 'Prabis' },
    ],
  },
];

export const FAV_PROPERTIES_KEY = '@gmarket:favorites';
