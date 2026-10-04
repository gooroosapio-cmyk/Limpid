/**
 * Corpus de recette (cahier V2, lot B) : document fictif rédigé pour les tests, sans donnée
 * privée. Plusieurs pages, chiffres avec unités et périodes, tableau, réserve explicite.
 */
export const EAU_VILLE_TITLE = "Bilan de l'eau potable de la ville de Clairval — 2025";

export const EAU_VILLE_PAGES: { heading: string; paragraphs: string[]; table?: string[][] }[] = [
  {
    heading: "1. Objet du bilan",
    paragraphs: [
      "Ce bilan présente la production, la consommation et les pertes d'eau potable de la ville de Clairval pour l'année 2025. Il a été établi par le service des eaux à partir des relevés des compteurs de production et des factures des abonnés.",
      "La ville compte 48 200 habitants desservis par un réseau de 312 kilomètres de canalisations. L'eau provient de deux forages situés au nord de la commune et d'une prise d'eau dans la rivière Lissonne.",
    ],
  },
  {
    heading: "2. Production et consommation",
    paragraphs: [
      "En 2025, les installations ont produit 3,9 millions de mètres cubes d'eau, contre 4,1 millions en 2024, soit une baisse d'environ 5 %. Les volumes facturés aux abonnés atteignent 3,1 millions de mètres cubes.",
      "La consommation domestique moyenne s'établit à 148 litres par habitant et par jour. Elle reste supérieure à l'objectif de 135 litres fixé par le plan communal pour 2027.",
    ],
    table: [
      ["Indicateur", "2024", "2025"],
      ["Volume produit (millions de m³)", "4,1", "3,9"],
      ["Volume facturé (millions de m³)", "3,1", "3,1"],
      ["Rendement du réseau", "75,6 %", "79,5 %"],
    ],
  },
  {
    heading: "3. Pertes du réseau",
    paragraphs: [
      "La différence entre l'eau produite et l'eau facturée correspond principalement aux fuites des canalisations. Le rendement du réseau, c'est-à-dire la part de l'eau produite qui est effectivement facturée, est passé de 75,6 % en 2024 à 79,5 % en 2025.",
      "Cette amélioration s'explique par le remplacement de 9 kilomètres de conduites anciennes et par la pose de 140 capteurs acoustiques qui détectent les fuites. Le service estime toutefois que les mesures de 2025 sous-estiment légèrement les pertes, car une partie des compteurs de production n'a été étalonnée qu'en septembre.",
    ],
  },
  {
    heading: "4. Perspectives",
    paragraphs: [
      "Le plan communal prévoit d'atteindre un rendement de 85 % d'ici 2030. Pour y parvenir, la ville remplacera 6 kilomètres de canalisations par an et équipera l'ensemble des quartiers de capteurs de fuite.",
      "Le bilan ne traite pas de la qualité sanitaire de l'eau, qui fait l'objet d'un rapport distinct de l'agence régionale de santé. Le coût de ces travaux n'est pas encore chiffré.",
    ],
  },
];
