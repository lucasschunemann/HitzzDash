/**
 * Taxonomias usadas na classificação automática (IA) e na agregação de padrões.
 * As chaves são estáveis (vão para o banco); os rótulos são o que a interface mostra.
 */

export const HOOK_TYPES = {
  launch_reveal: { label: "Lançamento / reveal", hint: "Apresenta um produto ou coleção nova pela primeira vez" },
  price_promo: { label: "Promoção e preço", hint: "Abre com preço, desconto ou \"de X por Y\"" },
  urgency_scarcity: { label: "Urgência e estoque limitado", hint: "Últimas unidades, só hoje, contagem regressiva" },
  promo_trip_event: { label: "Viagem ou evento promocional", hint: "Viagem da marca, feira, evento, pop-up" },
  styling_howto: { label: "Como estilizar / combinar", hint: "Ensina a montar looks com o calçado" },
  lookbook_tour: { label: "Lookbook / tour da coleção", hint: "Desfile de modelos ou passeio pela coleção" },
  unboxing: { label: "Unboxing", hint: "Abertura de caixa ou pedido" },
  behind_scenes: { label: "Bastidores e produção", hint: "Fábrica, sessão de fotos, rotina da equipe" },
  social_proof: { label: "Prova social / cliente", hint: "Depoimento, reação, número de vendas, cliente real" },
  comparison: { label: "Comparativo", hint: "Este x aquele, antes/agora, modelos lado a lado" },
  pov: { label: "POV", hint: "\"POV: você...\" coloca o espectador numa situação" },
  trend_audio: { label: "Trend com áudio viral", hint: "Formato ou áudio de tendência adaptado para a marca" },
  provocative_question: { label: "Pergunta provocativa", hint: "Abre com uma pergunta que gera curiosidade ou opinião" },
  before_after: { label: "Antes e depois", hint: "Transformação visual (look, pé, customização)" },
  product_demo: { label: "Teste / demonstração", hint: "Mostra conforto, resistência, solado, uso real" },
  brand_story: { label: "História da marca", hint: "Origem, fundadores, propósito, Blumenau/SC" },
  giveaway: { label: "Sorteio", hint: "Sorteio ou desafio com prêmio" },
  humor_skit: { label: "Humor / esquete", hint: "Cena cômica ou situação do dia a dia" },
  store_tour: { label: "Tour na loja", hint: "Mostra a loja física, vitrine, provador" },
  other: { label: "Outro", hint: "Não se encaixa nas categorias acima" },
} as const;
export type HookType = keyof typeof HOOK_TYPES;
export const HOOK_TYPE_KEYS = Object.keys(HOOK_TYPES) as [HookType, ...HookType[]];

export const FORMATS = {
  product_broll: "Produto em b-roll",
  try_on: "Provando / no pé",
  talking_head: "Pessoa falando para a câmera",
  lookbook_montage: "Montagem de looks",
  tutorial: "Tutorial passo a passo",
  skit: "Esquete / encenação",
  ugc_testimonial: "UGC / depoimento",
  event_vlog: "Vlog de viagem ou evento",
  text_slideshow: "Texto na tela + imagens",
  trend_transition: "Transição de trend",
  unboxing: "Unboxing",
  store_walkthrough: "Passeio pela loja",
  other: "Outro",
} as const;
export type Format = keyof typeof FORMATS;
export const FORMAT_KEYS = Object.keys(FORMATS) as [Format, ...Format[]];

export const THEMES = {
  new_collection: "Nova coleção / linha",
  product_launch: "Lançamento de produto",
  promotion_sale: "Promoção / liquidação",
  promo_trip_event: "Viagem / evento promocional",
  seasonal: "Sazonal e datas comemorativas",
  brand_daily: "Dia a dia da marca",
  comfort_quality: "Conforto e qualidade",
  style_trends: "Estilo e tendências",
  customer_community: "Clientes e comunidade",
  physical_store: "Loja física",
  brand_values: "Institucional / propósito",
  entertainment: "Entretenimento / humor",
  other: "Outro",
} as const;
export type Theme = keyof typeof THEMES;
export const THEME_KEYS = Object.keys(THEMES) as [Theme, ...Theme[]];

export const CTA_TYPES = {
  whatsapp: "WhatsApp",
  link_bio: "Link na bio",
  visit_store: "Visitar a loja",
  site_coupon: "Site / cupom",
  comment: "Comentar",
  dm: "Mandar DM",
  follow: "Seguir o perfil",
  save_share: "Salvar / compartilhar",
  tag_friend: "Marcar alguém",
  none: "Sem CTA",
  other: "Outro",
} as const;
export type CtaType = keyof typeof CTA_TYPES;
export const CTA_KEYS = Object.keys(CTA_TYPES) as [CtaType, ...CtaType[]];

export const OFFER_TYPES = {
  discount_percent: "Desconto em %",
  price_drop: "De X por Y",
  free_shipping: "Frete grátis",
  installments: "Parcelamento",
  bundle: "Kit / leve mais",
  coupon: "Cupom",
  launch: "Lançamento (sem desconto)",
  giveaway: "Sorteio / brinde",
  none: "Sem oferta",
} as const;
export type OfferType = keyof typeof OFFER_TYPES;
export const OFFER_KEYS = Object.keys(OFFER_TYPES) as [OfferType, ...OfferType[]];

export const CONFIDENCE = { low: "Baixa", medium: "Média", high: "Alta" } as const;
export type Confidence = keyof typeof CONFIDENCE;

export const GROUPS = {
  competitor: "Concorrente direto",
  reference: "Referência",
  own: "Conta própria",
} as const;

export const SCRIPT_CATEGORIES = {
  auto: "Deixar os dados decidirem",
  launch: "Lançamento",
  promotion: "Promoção",
  promo_trip: "Viagem promocional",
  seasonal: "Coleção sazonal",
  brand_daily: "Dia a dia da marca",
  styling: "Como usar / combinar",
  social_proof: "Prova social",
} as const;
export type ScriptCategory = keyof typeof SCRIPT_CATEGORIES;

export const TONES = {
  natural: "Natural e próximo",
  energetic: "Energético",
  premium: "Sofisticado",
  funny: "Bem-humorado",
  direct: "Direto ao ponto (vendas)",
} as const;
export type Tone = keyof typeof TONES;

export function hookLabel(k: string | null | undefined) {
  return (k && HOOK_TYPES[k as HookType]?.label) || "—";
}
export function formatLabel(k: string | null | undefined) {
  return (k && FORMATS[k as Format]) || "—";
}
export function themeLabel(k: string | null | undefined) {
  return (k && THEMES[k as Theme]) || "—";
}
export function ctaLabel(k: string | null | undefined) {
  return (k && CTA_TYPES[k as CtaType]) || "—";
}
export function offerLabel(k: string | null | undefined) {
  return (k && OFFER_TYPES[k as OfferType]) || "—";
}
