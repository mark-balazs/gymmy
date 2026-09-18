import type { Lang } from './types';

/**
 * What each seeded exercise is called in the gym, per language.
 *
 * Keyed by the canonical ENGLISH name, spelled exactly as in `seed.ts` — the
 * same key `EXERCISE_DETAILS` uses, so the two tables line up and one lookup
 * spells the same exercise in both.
 *
 * A name the user has typed themselves always wins over anything in here. The
 * seed writes the English name into `Exercise.name`, and from the moment the
 * user edits it that row is theirs: an exercise they renamed to "Front squat
 * (heels up)" must not silently revert to our Hungarian on a language switch.
 * This table is a fallback for *unedited* rows, and the caller is what enforces
 * that — it consults this only while the stored name still equals the key.
 *
 * `en` is deliberately absent: the key already is the English name, so an 'en'
 * entry could only ever restate it, and the two could drift apart.
 *
 * Several entries are still an English word on purpose. "Face Pull", "Hip
 * Thrust", "Dead Bug", "Sled Push" and the rest are what lifters in Berlin,
 * Budapest, Lyon and Madrid actually say out loud; the native-looking calque
 * ("Gesichtszug", "csípőtolás") is a phrase nobody has ever used under a bar,
 * and would read as a translation error rather than a translation. Where a real
 * native term exists it is used instead — Kreuzheben, felhúzás, peso muerto,
 * l'oiseau — even where an English loanword is also heard.
 *
 * Kept terse on purpose: these render as list rows on a 390px phone.
 */

/**
 * The languages this table carries: every one the app ships, minus English.
 *
 * Derived from `Lang` rather than written out flat, so adding a language is one
 * edit in `types.ts` and this cannot drift out of agreement with it. `en` is
 * excluded because the key already *is* the English name.
 */
type NameLang = Exclude<Lang, 'en'>;

/**
 * What to call an exercise.
 *
 * Only translated while the stored name is still the one we seeded. The moment
 * somebody renames a row it is theirs — an exercise they changed to "Front
 * squat (heels up)" must not silently revert to our German on a language
 * switch, and there is no way to translate their wording anyway.
 *
 * Lives here rather than with the dictionary because it consults no dictionary:
 * it is a table lookup over seeded data, which makes it a domain rule and keeps
 * it in the suite that runs in milliseconds.
 */
export function exerciseName(lang: Lang, e: { name: string } | null | undefined): string {
  if (!e) return '';
  if (lang === 'en') return e.name;
  return EXERCISE_NAMES[e.name]?.[lang] ?? e.name;
}

export const EXERCISE_NAMES: Record<string, Partial<Record<NameLang, string>>> = {
  /* ------------------------------------------------------------------ squat */
  'Goblet Squat': {
    hu: 'Goblet guggolás',
    de: 'Goblet Squat',
    fr: 'Goblet squat',
    es: 'Sentadilla goblet',
  },
  'Leg Press': {
    hu: 'Lábtolás',
    de: 'Beinpresse',
    fr: 'Presse à cuisses',
    es: 'Prensa de piernas',
  },
  'Barbell Back Squat': {
    hu: 'Guggolás rúddal',
    de: 'Kniebeuge',
    fr: 'Back squat',
    es: 'Sentadilla con barra',
  },
  'Barbell Front Squat': {
    hu: 'Front guggolás',
    de: 'Frontkniebeuge',
    fr: 'Front squat',
    es: 'Sentadilla frontal',
  },
  'Hack Squat': { hu: 'Hack guggolás', de: 'Hack Squat', fr: 'Hack squat', es: 'Sentadilla hack' },
  'Zercher Squat': {
    hu: 'Zercher guggolás',
    de: 'Zercher-Kniebeuge',
    fr: 'Zercher squat',
    es: 'Sentadilla Zercher',
  },
  'Box Squat': { hu: 'Box guggolás', de: 'Box Squat', fr: 'Box squat', es: 'Sentadilla al cajón' },
  'Smith Machine Squat': {
    hu: 'Guggolás Smith-gépen',
    de: 'Multipresse-Kniebeuge',
    fr: 'Squat à la Smith',
    es: 'Sentadilla en multipower',
  },

  /* ------------------------------------------------------------------ hinge */
  'Romanian Deadlift': {
    hu: 'Román felhúzás',
    de: 'Rumänisches Kreuzheben',
    fr: 'Soulevé roumain',
    es: 'Peso muerto rumano',
  },
  'Conventional Deadlift': {
    hu: 'Felhúzás',
    de: 'Kreuzheben',
    fr: 'Soulevé de terre',
    es: 'Peso muerto',
  },
  'Trap Bar Deadlift': {
    hu: 'Trap bar felhúzás',
    de: 'Trap-Bar-Kreuzheben',
    fr: 'Soulevé trap bar',
    es: 'Peso muerto con barra hexagonal',
  },
  'Hip Thrust': { hu: 'Hip thrust', de: 'Hip Thrust', fr: 'Hip thrust', es: 'Hip thrust' },
  'Good Morning': {
    hu: 'Good morning',
    de: 'Good Morning',
    fr: 'Good morning',
    es: 'Good morning',
  },
  'Back Extension': {
    hu: 'Hiperextenzió',
    de: 'Rückenstrecken',
    fr: 'Extension lombaire',
    es: 'Hiperextensión',
  },
  'Kettlebell Swing': {
    hu: 'Kettlebell lendítés',
    de: 'Kettlebell Swing',
    fr: 'Swing kettlebell',
    es: 'Swing con kettlebell',
  },
  'Single-Leg RDL': {
    hu: 'Egylábas román felhúzás',
    de: 'Einbeiniges Kreuzheben',
    fr: 'RDL unilatéral',
    es: 'Peso muerto a una pierna',
  },
  'Cable Pull-Through': {
    hu: 'Pull-through csigán',
    de: 'Kabel-Pull-Through',
    fr: 'Pull-through à la poulie',
    es: 'Pull-through en polea',
  },

  /* ------------------------------------------------------------------ lunge */
  'Walking Lunge': {
    hu: 'Sétáló kitörés',
    de: 'Gehende Ausfallschritte',
    fr: 'Fentes marchées',
    es: 'Zancada caminando',
  },
  'Reverse Lunge': {
    hu: 'Hátra kitörés',
    de: 'Ausfallschritt rückwärts',
    fr: 'Fente arrière',
    es: 'Zancada hacia atrás',
  },
  'Bulgarian Split Squat': {
    hu: 'Bolgár kitörés',
    de: 'Bulgarian Split Squat',
    fr: 'Fente bulgare',
    es: 'Sentadilla búlgara',
  },
  'Step-Up': { hu: 'Fellépés', de: 'Step-Up', fr: 'Step-up', es: 'Step-up' },
  'Split Squat': {
    hu: 'Statikus kitörés',
    de: 'Split Squat',
    fr: 'Split squat',
    es: 'Zancada estática',
  },
  'Curtsy Lunge': {
    hu: 'Keresztbe kitörés',
    de: 'Curtsy Lunge',
    fr: 'Fente croisée',
    es: 'Zancada cruzada',
  },
  'Lateral Lunge': {
    hu: 'Oldalsó kitörés',
    de: 'Seitlicher Ausfallschritt',
    fr: 'Fente latérale',
    es: 'Zancada lateral',
  },

  /* ------------------------------------------------------------------- push */
  'DB Bench Press': {
    hu: 'Kézisúlyzós fekvenyomás',
    de: 'Kurzhantel-Bankdrücken',
    fr: 'Développé couché haltères',
    es: 'Press banca con mancuernas',
  },
  'Barbell Bench Press': {
    hu: 'Fekvenyomás',
    de: 'Bankdrücken',
    fr: 'Développé couché',
    es: 'Press de banca',
  },
  'Overhead Press': {
    hu: 'Vállból nyomás',
    de: 'Militärdrücken',
    fr: 'Développé militaire',
    es: 'Press militar',
  },
  'DB Shoulder Press': {
    hu: 'Vállnyomás kézisúlyzóval',
    de: 'Kurzhantel-Schulterdrücken',
    fr: 'Développé épaules haltères',
    es: 'Press de hombros con mancuernas',
  },
  'Incline DB Press': {
    hu: 'Ferdepados nyomás',
    de: 'Schrägbankdrücken',
    fr: 'Développé incliné haltères',
    es: 'Press inclinado con mancuernas',
  },
  'Push-Up': { hu: 'Fekvőtámasz', de: 'Liegestütz', fr: 'Pompes', es: 'Flexiones' },
  Dip: { hu: 'Tolódzkodás', de: 'Dips', fr: 'Dips', es: 'Fondos' },
  'Machine Chest Press': {
    hu: 'Gépi mellnyomás',
    de: 'Brustpresse',
    fr: 'Développé machine',
    es: 'Press de pecho en máquina',
  },
  'Landmine Press': {
    hu: 'Landmine nyomás',
    de: 'Landmine Press',
    fr: 'Landmine press',
    es: 'Press landmine',
  },

  /* ------------------------------------------------------------------- pull */
  'Lat Pulldown': { hu: 'Lehúzás', de: 'Latzug', fr: 'Tirage vertical', es: 'Jalón al pecho' },
  'Pull-Up': { hu: 'Húzódzkodás', de: 'Klimmzug', fr: 'Tractions', es: 'Dominadas' },
  'Chin-Up': {
    hu: 'Húzódzkodás alsó fogással',
    de: 'Klimmzug im Untergriff',
    fr: 'Tractions supination',
    es: 'Dominadas supinas',
  },
  'Seated Cable Row': {
    hu: 'Ülő csigás evezés',
    de: 'Kabelrudern sitzend',
    fr: 'Rowing assis poulie',
    es: 'Remo en polea sentado',
  },
  'Barbell Row': {
    hu: 'Evezés rúddal',
    de: 'Langhantelrudern',
    fr: 'Rowing barre',
    es: 'Remo con barra',
  },
  'DB Row': {
    hu: 'Egykezes evezés',
    de: 'Kurzhantelrudern',
    fr: 'Rowing haltère',
    es: 'Remo con mancuerna',
  },
  'Chest-Supported Row': {
    hu: 'Mellkastámaszos evezés',
    de: 'Rudern mit Brustauflage',
    fr: 'Rowing buste calé',
    es: 'Remo con apoyo en pecho',
  },
  'Face Pull': { hu: 'Face pull', de: 'Face Pull', fr: 'Face pull', es: 'Face pull' },
  'Inverted Row': {
    hu: 'Fordított evezés',
    de: 'Inverted Row',
    fr: 'Rowing inversé',
    es: 'Remo invertido',
  },

  /* ----------------------------------------------------------------- rotate */
  'Pallof Press': {
    hu: 'Pallof press',
    de: 'Pallof Press',
    fr: 'Pallof press',
    es: 'Pallof press',
  },
  'Cable Woodchop': {
    hu: 'Favágás csigán',
    de: 'Holzfäller am Kabel',
    fr: 'Woodchopper poulie',
    es: 'Leñador en polea',
  },
  'Landmine Rotation': {
    hu: 'Landmine rotáció',
    de: 'Landmine-Rotation',
    fr: 'Rotation landmine',
    es: 'Rotación landmine',
  },
  'Half-Kneeling Chop': {
    hu: 'Féltérdelő favágás',
    de: 'Chop im Halbknien',
    fr: 'Chop à genou',
    es: 'Chop de rodillas',
  },
  'Russian Twist': {
    hu: 'Orosz csavarás',
    de: 'Russian Twist',
    fr: 'Russian twist',
    es: 'Giro ruso',
  },
  'Bird Dog': { hu: 'Bird dog', de: 'Bird Dog', fr: 'Bird dog', es: 'Bird dog' },
  'Dead Bug': { hu: 'Dead bug', de: 'Dead Bug', fr: 'Dead bug', es: 'Dead bug' },
  'Side Plank': { hu: 'Oldalplank', de: 'Seitstütz', fr: 'Gainage latéral', es: 'Plancha lateral' },

  /* ------------------------------------------------------------------ carry */
  "Farmer's Carry": {
    hu: 'Farmerjárás',
    de: "Farmer's Walk",
    fr: 'Farmer walk',
    es: 'Paseo del granjero',
  },
  'Suitcase Carry': {
    hu: 'Bőröndjárás',
    de: 'Koffertragen',
    fr: 'Marche valise',
    es: 'Paseo maleta',
  },
  'Front Rack Carry': {
    hu: 'Front rack hordás',
    de: 'Front Rack Carry',
    fr: 'Portage front rack',
    es: 'Paseo en front rack',
  },
  'Overhead Carry': {
    hu: 'Fej feletti cipelés',
    de: 'Überkopf-Tragen',
    fr: 'Portage overhead',
    es: 'Paseo sobre la cabeza',
  },
  'Sled Push': { hu: 'Szántolás', de: 'Sled Push', fr: 'Sled push', es: 'Empuje de trineo' },
  'Sled Drag': { hu: 'Szánhúzás', de: 'Sled Drag', fr: 'Sled drag', es: 'Arrastre de trineo' },
  "Waiter's Walk": {
    hu: 'Pincérjárás',
    de: "Waiter's Walk",
    fr: 'Marche du serveur',
    es: 'Paseo del camarero',
  },

  /* -------------------------------------------------------------- isolation */
  'Lateral Raise': {
    hu: 'Oldalemelés',
    de: 'Seitheben',
    fr: 'Élévations latérales',
    es: 'Elevaciones laterales',
  },
  'Cable Curl': {
    hu: 'Csigás bicepszezés',
    de: 'Kabel-Bizepscurl',
    fr: 'Curl à la poulie',
    es: 'Curl en polea',
  },
  'DB Curl': {
    hu: 'Kézisúlyzós bicepszezés',
    de: 'Kurzhantel-Curl',
    fr: 'Curl haltères',
    es: 'Curl con mancuernas',
  },
  'Hammer Curl': {
    hu: 'Kalapácsos bicepszezés',
    de: 'Hammercurl',
    fr: 'Curl marteau',
    es: 'Curl martillo',
  },
  'Tricep Pushdown': {
    hu: 'Tricepsz lenyomás',
    de: 'Trizepsdrücken',
    fr: 'Extension triceps poulie',
    es: 'Extensión de tríceps en polea',
  },
  'Overhead Tricep Extension': {
    hu: 'Fej feletti tricepsznyújtás',
    de: 'Überkopf-Trizepsdrücken',
    fr: 'Extension triceps nuque',
    es: 'Extensión de tríceps tras nuca',
  },
  'Leg Extension': {
    hu: 'Lábnyújtás',
    de: 'Beinstrecken',
    fr: 'Leg extension',
    es: 'Extensión de piernas',
  },
  'Leg Curl': { hu: 'Lábhajlítás', de: 'Beinbeugen', fr: 'Leg curl', es: 'Curl femoral' },
  'Calf Raise': {
    hu: 'Vádliemelés',
    de: 'Wadenheben',
    fr: 'Élévations mollets',
    es: 'Elevación de gemelos',
  },
  'Cable Abduction': {
    hu: 'Csigás combtávolítás',
    de: 'Kabel-Abduktion',
    fr: 'Abduction à la poulie',
    es: 'Abducción en polea',
  },
  'Glute Kickback': {
    hu: 'Farizom-kirúgás',
    de: 'Glute Kickback',
    fr: 'Kickback fessier',
    es: 'Patada de glúteo',
  },
  'Rear Delt Fly': {
    hu: 'Fordított tárogatás',
    de: 'Reverse Butterfly',
    fr: 'Oiseau',
    es: 'Pájaros',
  },
  'Chest Fly': { hu: 'Tárogatás', de: 'Butterfly', fr: 'Écartés', es: 'Aperturas' },

  /* ------------------------------------------------------------- added */
  'Bodyweight Squat': {
    hu: 'Testsúlyos guggolás',
    de: 'Kniebeuge ohne Gewicht',
    fr: 'Squat au poids du corps',
    es: 'Sentadilla sin peso',
  },
  'DB Squat': {
    hu: 'Kézisúlyzós guggolás',
    de: 'Kurzhantel-Kniebeuge',
    fr: 'Squat haltères',
    es: 'Sentadilla con mancuernas',
  },
  'Sumo Deadlift': {
    hu: 'Szumó felhúzás',
    de: 'Sumo-Kreuzheben',
    fr: 'Soulevé sumo',
    es: 'Peso muerto sumo',
  },
  'Nordic Curl': {
    hu: 'Nordic curl',
    de: 'Nordic Curl',
    fr: 'Nordic curl',
    es: 'Curl nórdico',
  },
  'Barbell Reverse Lunge': {
    hu: 'Hátra kitörés rúddal',
    de: 'Ausfallschritt rückwärts mit Langhantel',
    fr: 'Fente arrière barre',
    es: 'Zancada hacia atrás con barra',
  },
  'Close-Grip Bench Press': {
    hu: 'Szűk fogású fekvenyomás',
    de: 'Enges Bankdrücken',
    fr: 'Développé couché prise serrée',
    es: 'Press de banca con agarre cerrado',
  },
  'Incline Barbell Press': {
    hu: 'Ferdepados nyomás rúddal',
    de: 'Langhantel-Schrägbankdrücken',
    fr: 'Développé incliné barre',
    es: 'Press inclinado con barra',
  },
  'Push Press': {
    hu: 'Push press',
    de: 'Push Press',
    fr: 'Push press',
    es: 'Push press',
  },
  'T-Bar Row': {
    hu: 'T-rudas evezés',
    de: 'T-Bar-Rudern',
    fr: 'Rowing T-bar',
    es: 'Remo en barra T',
  },
  'Weighted Pull-Up': {
    hu: 'Húzódzkodás plusz súllyal',
    de: 'Klimmzug mit Zusatzgewicht',
    fr: 'Tractions lestées',
    es: 'Dominadas lastradas',
  },
  'Hanging Knee Raise': {
    hu: 'Függő térdemelés',
    de: 'Hängendes Knieheben',
    fr: 'Relevé de genoux suspendu',
    es: 'Elevación de rodillas colgado',
  },
  'Barbell Shrug': {
    hu: 'Vállvonogatás rúddal',
    de: 'Schulterheben mit Langhantel',
    fr: 'Shrugs barre',
    es: 'Encogimientos con barra',
  },
  'Preacher Curl': {
    hu: 'Scott-pados bicepszezés',
    de: 'Scott-Curl',
    fr: 'Curl au pupitre',
    es: 'Curl predicador',
  },
  'Skull Crusher': {
    hu: 'Fekvő tricepsznyújtás',
    de: 'Stirndrücken',
    fr: 'Extension triceps couché',
    es: 'Press francés',
  },
  'Seated Calf Raise': {
    hu: 'Ülő vádliemelés',
    de: 'Wadenheben sitzend',
    fr: 'Élévations mollets assis',
    es: 'Elevación de gemelos sentado',
  },
  'Power Clean': {
    hu: 'Power clean',
    de: 'Power Clean',
    fr: 'Power clean',
    es: 'Cargada de potencia',
  },
  'Power Snatch': {
    hu: 'Power snatch',
    de: 'Power Snatch',
    fr: 'Power snatch',
    es: 'Arrancada de potencia',
  },
  'Clean and Jerk': {
    hu: 'Lökés',
    de: 'Stoßen',
    fr: 'Épaulé-jeté',
    es: 'Dos tiempos',
  },
  'Push Jerk': {
    hu: 'Push jerk',
    de: 'Push Jerk',
    fr: 'Push jerk',
    es: 'Push jerk',
  },
  'Overhead Squat': {
    hu: 'Fej feletti guggolás',
    de: 'Überkopf-Kniebeuge',
    fr: 'Overhead squat',
    es: 'Sentadilla sobre la cabeza',
  },
  'Front Rack Lunge': {
    hu: 'Front rack kitörés',
    de: 'Front-Rack-Ausfallschritt',
    fr: 'Fente front rack',
    es: 'Zancada en front rack',
  },
  Thruster: {
    hu: 'Thruster',
    de: 'Thruster',
    fr: 'Thruster',
    es: 'Thruster',
  },
  'DB Snatch': {
    hu: 'Kézisúlyzós szakítás',
    de: 'Kurzhantel-Snatch',
    fr: 'Arraché haltère',
    es: 'Arrancada con mancuerna',
  },
  "Devil's Press": {
    hu: "Devil's press",
    de: "Devil's Press",
    fr: "Devil's press",
    es: "Devil's press",
  },
  'Kettlebell Snatch': {
    hu: 'Kettlebell szakítás',
    de: 'Kettlebell Snatch',
    fr: 'Arraché kettlebell',
    es: 'Arrancada con kettlebell',
  },
  'Wall Ball': {
    hu: 'Wall ball',
    de: 'Wall Ball',
    fr: 'Wall ball',
    es: 'Wall ball',
  },
  'Box Jump': {
    hu: 'Boxra ugrás',
    de: 'Box Jump',
    fr: 'Box jump',
    es: 'Salto al cajón',
  },
  'Chest-to-Bar Pull-Up': {
    hu: 'Húzódzkodás mellig',
    de: 'Chest-to-Bar-Klimmzug',
    fr: 'Tractions chest-to-bar',
    es: 'Dominadas al pecho',
  },
  'Ring Row': {
    hu: 'Gyűrűs evezés',
    de: 'Ring Row',
    fr: 'Rowing aux anneaux',
    es: 'Remo en anillas',
  },
  'Handstand Push-Up': {
    hu: 'Kézenállásos fekvőtámasz',
    de: 'Handstand-Liegestütz',
    fr: 'Pompes en équilibre',
    es: 'Flexiones en pino',
  },
  'Ring Dip': {
    hu: 'Gyűrűs tolódzkodás',
    de: 'Ring Dips',
    fr: 'Dips aux anneaux',
    es: 'Fondos en anillas',
  },
  'Toes-to-Bar': {
    hu: 'Toes-to-bar',
    de: 'Toes-to-Bar',
    fr: 'Toes-to-bar',
    es: 'Pies a la barra',
  },
  'GHD Sit-Up': {
    hu: 'GHD felülés',
    de: 'GHD Sit-Up',
    fr: 'Sit-up GHD',
    es: 'Abdominales en GHD',
  },
  'Turkish Get-Up': {
    hu: 'Török felállás',
    de: 'Turkish Get-Up',
    fr: 'Relevé turc',
    es: 'Levantamiento turco',
  },
  'Sandbag Carry': {
    hu: 'Homokzsákos hordás',
    de: 'Sandsacktragen',
    fr: 'Portage sandbag',
    es: 'Paseo con saco de arena',
  },
};
