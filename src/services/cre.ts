import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// Static Profiles detailing physical and heat properties of kitchen equipment
export interface EquipmentProfile {
  name: string;
  heatTransfer: string;
  moistureLoss: string;
  airCirculation: string;
  fatBehavior: string;
  fondCreation: string;
  bestSuitedFor: string[];
}

export const EQUIPMENT_PROFILES: Record<string, EquipmentProfile> = {
  'Air Fryer': {
    name: 'Air Fryer',
    heatTransfer: 'Convecção de ar super rápido',
    moistureLoss: 'Alta evaporação superficial, preserva umidade interna',
    airCirculation: 'Extremamente alta',
    fatBehavior: 'Escorre e drena gorduras',
    fondCreation: 'Nula (sem contato plano, sem resíduos deglaçáveis)',
    bestSuitedFor: ['Assar', 'Crocante', 'Desidratar', 'Grelhar leve']
  },
  'Frigideira Inox': {
    name: 'Frigideira Inox',
    heatTransfer: 'Condução por contato direto',
    moistureLoss: 'Alta evaporação (sistema aberto)',
    airCirculation: 'Nula',
    fatBehavior: 'Mantém gordura em contato com o alimento',
    fondCreation: 'Excelente (cria resíduos caramelizados ideais para molhos)',
    bestSuitedFor: ['Selar', 'Refogar', 'Deglaçar', 'Saltear']
  },
  'Panela de Ferro': {
    name: 'Panela de Ferro',
    heatTransfer: 'Condução direta com alta inércia térmica',
    moistureLoss: 'Média a alta (depende de usar tampa)',
    airCirculation: 'Nula',
    fatBehavior: 'Mantém gordura em contato térmico denso',
    fondCreation: 'Excelente',
    bestSuitedFor: ['Selar', 'Guisar', 'Fritar', 'Brasear']
  },
  'Panela de Pressão': {
    name: 'Panela de Pressão',
    heatTransfer: 'Convecção por vapor sob pressão (calor úmido)',
    moistureLoss: 'Praticamente nula durante a pressurização',
    airCirculation: 'Nula (sistema selado)',
    fatBehavior: 'Emulsifica parcialmente com o líquido da cocção',
    fondCreation: 'Muito baixa (evita caramelização devido à alta umidade)',
    bestSuitedFor: ['Cozimento lento rápido', 'Brasear', 'Caldos', 'Grãos duros']
  },
  'Panela Antiaderente': {
    name: 'Panela Antiaderente',
    heatTransfer: 'Condução direta suave',
    moistureLoss: 'Alta evaporação (sistema aberto)',
    airCirculation: 'Nula',
    fatBehavior: 'Mantém gordura em contato, mas exige menos óleo',
    fondCreation: 'Pobre (alimentos não grudam para formar o "fond")',
    bestSuitedFor: ['Preparos delicados', 'Ovos', 'Refugar leve', 'Molhos rápidos']
  },
  'Forno': {
    name: 'Forno',
    heatTransfer: 'Irradiação e convecção lenta',
    moistureLoss: 'Lenta e uniforme',
    airCirculation: 'Baixa a média',
    fatBehavior: 'Derrete lentamente e permanece na assadeira',
    fondCreation: 'Média (ocorre no fundo da assadeira)',
    bestSuitedFor: ['Assar', 'Gratinar', 'Assados lentos']
  },
  'Fogão': {
    name: 'Fogão',
    heatTransfer: 'Condução direta por calor basal',
    moistureLoss: 'Variável',
    airCirculation: 'Nula',
    fatBehavior: 'Variável',
    fondCreation: 'Variável',
    bestSuitedFor: ['Ferver', 'Refogar', 'Cozinhar massas']
  }
};

export interface AdaptedStep {
  stepOrder: number;
  originalText: string;
  adaptedText: string;
  reason: string;
}

export interface AdaptationResult {
  id?: number;
  sourceEquipment: string;
  targetEquipment: string;
  confidence: number;
  adaptationsApplied: AdaptedStep[];
  explanation: string;
}

/**
 * Returns available user equipments from database
 */
export async function getEquipmentList() {
  return await db.select().from(schema.userEquipments);
}

/**
 * Toggle availability of a specific kitchen equipment
 */
export async function toggleEquipment(id: number, isAvailable: boolean) {
  const [updated] = await db
    .update(schema.userEquipments)
    .set({ isAvailable })
    .where(eq(schema.userEquipments.id, id))
    .returning();
  console.log(`[CRE] Toggled equipment #${id} availability: ${isAvailable}`);
  return updated;
}

/**
 * Adapts a recipe version's cooking steps to match a target equipment.
 * Computes physical changes, step updates, reasons, and a confidence level.
 */
export async function adaptRecipeForEquipment(
  recipeVersionId: number,
  targetEquipment: string,
  cookingSessionId?: number
): Promise<AdaptationResult> {
  // 1. Fetch version and associated techniques
  const version = await db.query.recipeVersions.findFirst({
    where: eq(schema.recipeVersions.id, recipeVersionId)
  });
  if (!version) throw new Error(`Recipe version #${recipeVersionId} not found.`);

  const recipe = await db.query.recipes.findFirst({
    where: eq(schema.recipes.id, version.recipeId)
  });
  const recipeName = recipe?.name || 'Receita';

  const originalSteps = await db
    .select({
      order: schema.recipeTechniques.stepOrder,
      notes: schema.recipeTechniques.notes,
      techName: schema.recipeTechniques.notes, // fallback or notes
      techniqueId: schema.recipeTechniques.techniqueId
    })
    .from(schema.recipeTechniques)
    .where(eq(schema.recipeTechniques.recipeVersionId, recipeVersionId));

  // Determine original equipment based on the steps/description
  // Default to Frigideira Inox or Fogão if not specified
  let sourceEquipment = 'Frigideira Inox';
  if (version.name.toLowerCase().includes('forno') || version.description?.toLowerCase().includes('forno')) {
    sourceEquipment = 'Forno';
  } else if (version.name.toLowerCase().includes('pressão') || version.description?.toLowerCase().includes('pressão')) {
    sourceEquipment = 'Panela de Pressão';
  }

  // 2. Perform Physical Adaptation Checks
  const adaptedSteps: AdaptedStep[] = [];
  let totalConfidence = 0;
  let stepsCount = originalSteps.length;

  if (stepsCount === 0) {
    // If no technical steps in DB, add a dummy/inferred step based on description
    originalSteps.push({
      order: 1,
      notes: version.description || 'Preparar a receita conforme passos tradicionais.',
      techName: 'Cozimento',
      techniqueId: 0
    });
    stepsCount = 1;
  }

  for (const step of originalSteps) {
    const notesText = step.notes || '';
    const textLower = notesText.toLowerCase();
    let adaptedText = notesText;
    let reason = 'Técnica padrão compatível.';
    let stepConfidence = 1.0; // 100% by default

    // Scenario C: Conventional Oven -> Air Fryer
    if (sourceEquipment === 'Forno' && targetEquipment === 'Air Fryer') {
      if (textLower.includes('gratinar') || textLower.includes('dourar') || textLower.includes('crosta')) {
        adaptedText = `Preaqueça a Air Fryer a 200°C. Se o prato exigir cozimento longo (como 15 minutos ou mais), NÃO coloque o queijo no início. O fluxo de ar quente contínuo secará totalmente a umidade do queijo, impedindo que derreta ou doure e criando uma película dura/borrachuda. Cozinhe o alimento primeiro e adicione o queijo apenas nos últimos 3 a 5 minutos. Pincele uma fina camada de azeite ou manteiga derretida sobre o queijo (o lipídio atua como catalisador térmico para a reação de Maillard e protege contra a evaporação rápida). Dica: use queijo fatiado ou ralado na hora com alto teor de gordura. Evite queijo ralado de saquinho industrializado, pois contém amido e apenas ressecará sem gratinar. Além disso, não cubra o cesto com papel alumínio nem use formas de bordas muito altas que barrem o fluxo direto de ar.`;
        reason = `Gratinar na Air Fryer requer contato térmico de radiação direta e controle rígido de umidade. Deixar o queijo sob convecção forçada a 200°C por 15 minutos desidrata totalmente a proteína láctea, impedindo a fusão perfeita. Dividir a cocção (adicionar o queijo nos últimos 3-5 minutos), pincelar gordura e evitar queijos ultraprocessados ou barreiras físicas ao vento quente são cruciais para a Maillard.`;
        stepConfidence = 0.90;
      } else {
        adaptedText = `Preaqueça a Air Fryer a 180°C. Reduza o tempo de forno original in 30% (ex: se eram 30 minutos, faça em 20 minutos). Acompanhe o douramento visual.`;
        reason = `A alta circulação de ar quente e o cesto compacto da Air Fryer aceleram a troca de calor basal, assando os alimentos de forma muito mais rápida do que um forno convencional.`;
        stepConfidence = 0.95;
      }
    }
    // Scenario A: Skillet / Pan (Frigideira Inox / Panela) -> Air Fryer
    else if (sourceEquipment !== 'Air Fryer' && targetEquipment === 'Air Fryer') {
      if (textLower.includes('selar') || textLower.includes('grelhar') || textLower.includes('fritar')) {
        adaptedText = `Pincele uma camada de azeite sobre a superfície do alimento. Disponha no cesto preaquecido a 200°C por 12-15 minutos, virando na metade do tempo. Não adicione a manteiga agora.`;
        reason = `A Air Fryer assa por convecção e drena gorduras; a fina camada de azeite inicial garante a condução rápida do calor e caramelização. Mover a manteiga impede que queime devido à alta circulação de ar quente.`;
        stepConfidence = 0.85;
      } else if (textLower.includes('manteiga') || textLower.includes('alho dente') || textLower.includes('regar') || textLower.includes('deglacear')) {
        adaptedText = `À parte (no micro-ondas por 30s ou em pequena panela), derreta a manteiga com os dentes de alho amassados. Regue por cima das bistecas/carnes assim que saírem quentes da Air Fryer.`;
        reason = `Não existe fond em convecção de ar, impedindo deglaçagem direta no cesto. A finalização externa com a manteiga de alho derretida preserva integralmente o sabor e umidade.`;
        stepConfidence = 0.80;
      } else if (textLower.includes('refogar') || textLower.includes('cebola')) {
        adaptedText = `Misture a cebola com um fio de azeite e asse na Air Fryer a 180°C por 6-8 minutos mexendo na metade, até murchar levemente.`;
        reason = `A cebola refoga por convecção simulada ao misturá-la com óleo e usar uma temperatura ligeiramente menor para não desidratar ou queimar.`;
        stepConfidence = 0.75;
      } else {
        stepConfidence = 0.90;
      }
    }
    // Scenario B: Skillet / Pot -> Pressure Cooker (Panela de Pressão)
    else if (sourceEquipment !== 'Panela de Pressão' && targetEquipment === 'Panela de Pressão') {
      if (textLower.includes('selar') || textLower.includes('dourar')) {
        adaptedText = `Ative a função refogar/selar da panela de pressão (ou mantenha-a aberta em fogo médio-alto) e sele a carne com azeite por 3 minutos de cada lado antes de fechar.`;
        reason = `A selagem exige calor seco por contato basal direto. Deve ser feita com a panela aberta e bem quente para reter os sucos e caramelizar a superfície.`;
        stepConfidence = 0.80;
      } else if (textLower.includes('cozinhar') || textLower.includes('água') || textLower.includes('caldo') || textLower.includes('reduzir')) {
        // Reduce liquid by 40%
        adaptedText = `Reduza a quantidade de caldo/água adicionada em 40% (adicione apenas o suficiente para cobrir parcialmente). Feche a panela e cozinhe sob pressão por 15-20 minutos.`;
        reason = `A panela de pressão é um sistema selado que impede a evaporação de água. A redução de líquidos evita que o molho final fique excessivamente diluído ou aguado.`;
        stepConfidence = 0.60;
      } else {
        stepConfidence = 0.50; // Low confidence for overall adaptation of dry dishes to pressure cookers
      }
    }
    // Scenario D: Utensil Interchangeability (Mixer -> Liquidificador, etc.)
    else if (textLower.includes('liquidificador') && targetEquipment === 'Mixer') {
      adaptedText = `Utilize um mixer de mão diretamente no recipiente alto, processando em velocidade média até obter textura homogênea.`;
      reason = `O mixer de mão realiza a mesma cisalhagem mecânica do liquidificador para pequenas e médias porções com menos sujeira.`;
      stepConfidence = 0.95;
    }

    adaptedSteps.push({
      stepOrder: step.order,
      originalText: notesText,
      adaptedText,
      reason
    });
    totalConfidence += stepConfidence;
  }

  const confidence = Math.round((totalConfidence / stepsCount) * 100);

  // Generate physical explanation
  let explanation = '';
  if (targetEquipment === 'Air Fryer') {
    explanation = 'A Air Fryer transfere calor por convecção forçada e drena gorduras. As adaptações garantem que a carne não resseque (azeite inicial) e que a manteiga aromática não queime (aplicada apenas na finalização).';
  } else if (targetEquipment === 'Panela de Pressão') {
    explanation = 'A panela de pressão cozinha por calor úmido sob alta pressão sem evaporação. A adaptação exige a selagem inicial com a panela aberta e a redução drástica de líquidos para não diluir os sabores.';
  } else if (sourceEquipment === 'Forno' && targetEquipment === 'Air Fryer') {
    explanation = 'A convecção rápida acelera o cozimento. Ajustamos o tempo para baixo em 30% para evitar que doure demais por fora antes de cozinhar por dentro.';
  } else {
    explanation = `Adaptação sugerida de ${sourceEquipment} para ${targetEquipment} preservando os objetivos originais de cocção e textura.`;
  }

  // 3. Save adaptation in SQLite database
  const [adaptation] = await db
    .insert(schema.recipeAdaptations)
    .values({
      cookingSessionId: cookingSessionId ?? null,
      recipeVersionId,
      sourceEquipment,
      targetEquipment,
      adaptationsApplied: JSON.stringify(adaptedSteps),
      confidence
    })
    .returning();

  console.log(`[CRE] Created adaptation #${adaptation.id} (${sourceEquipment} ➔ ${targetEquipment}) with confidence ${confidence}% for "${recipeName}"`);

  return {
    id: adaptation.id,
    sourceEquipment,
    targetEquipment,
    confidence,
    adaptationsApplied: adaptedSteps,
    explanation
  };
}

/**
 * Save user feedback rating for a generated adaptation
 */
export async function logAdaptationFeedback(adaptationId: number, rating: string) {
  const validRatings = ['Excelente', 'Boa', 'Regular', 'Ruim'];
  if (!validRatings.includes(rating)) {
    throw new Error(`Invalid adaptation feedback rating: ${rating}`);
  }

  const [updated] = await db
    .update(schema.recipeAdaptations)
    .set({ feedbackRating: rating })
    .where(eq(schema.recipeAdaptations.id, adaptationId))
    .returning();

  console.log(`[CRE] Logged feedback "${rating}" for adaptation #${adaptationId}`);
  return updated;
}
